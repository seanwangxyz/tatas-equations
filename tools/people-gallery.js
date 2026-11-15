// People gallery (dev page): every body, hair style, skin tone, face option and accessory, drawn with the real rig
// from the front, 3/4 and the back. On demand only: window.gallery.render(name, opts) draws one section and returns
// a JPEG data URL (it also shows it on the page).
import * as THREE from 'three';
import { buildPerson, personDims } from '../js/three/creatures/people.js';
import { buildKid, KID, KITS, kitFromSave } from '../js/three/creatures/kid.js';
import { buildTata, TATA } from '../js/three/creatures/grownup.js';

const P = window.People;
const A = (o) => Object.assign({}, P.DEFAULT, o);
const G = (o) => Object.assign({}, P.GROWN, o);
const KIT_K = KITS.red, KIT_A = KITS.yellow;
const KIT_B = kitFromSave({ shirt: '#1c7ed6', trim: '#ffffff', shorts: '#1d2b3a', pattern: 'plain' });
const KIT_C = kitFromSave({ shirt: '#f1f3f5', trim: '#2f8f7c', shorts: '#1d2b3a', pattern: 'waves' });
const person = (label, av, kit, num, name) => ({ label, av, make: () => buildPerson({ avatar: av, kit: kit || (P.isAdult(P.clean(av)) ? KIT_A : KIT_K), num: num || '7', name: name == null ? 'SAM' : name }), dims: () => personDims(av) });
const STYLES = P.HAIR_STYLES.map((s) => s[0]);
const SKIN3 = [['light', '#fbe3d0'], ['medium', '#c68a5c'], ['dark', '#4a2a18']];

const SECTIONS = {
  today: () => [
    { label: 'buildKid()', make: () => buildKid(KIT_K, '7', 'TYSON W.'), dims: () => KID },
    { label: 'People.DEFAULT', make: () => buildPerson({ avatar: P.DEFAULT, kit: KIT_K, num: '7', name: 'TYSON W.' }), dims: () => personDims(P.DEFAULT) },
    { label: 'buildTata()', make: () => buildTata(), dims: () => TATA },
    { label: 'People.GROWN', make: () => buildPerson({ avatar: P.GROWN, kit: KIT_A, num: '17', name: 'TATA' }), dims: () => personDims(P.GROWN) }
  ],
  bodies: () => P.BODIES.map((b) => person(b[0], { body: b[0], hairStyle: 'short', beard: 'none' })),
  heights: () => { const out = []; P.BODIES.forEach((b) => [-1, 0, 1].forEach((h) => out.push(person(b[0] + ' ' + h, { body: b[0], height: h, hairStyle: 'short', beard: 'none' })))); return out; },
  'hair-kid': () => STYLES.map((s, i) => person(s, A({ hairStyle: s, hair: P.HAIR_COLORS[i % 9][0] }), null, '10', 'ALEXANDRA')),
  'hair-adult': () => STYLES.map((s, i) => person(s, G({ body: i % 2 ? 'adult-a' : 'adult-b', hairStyle: s, beard: 'none', hair: P.HAIR_COLORS[(i * 5) % 16][0] }), null, '21', 'ROBERTS')),
  'hair-teen': () => STYLES.map((s, i) => person(s, A({ body: i % 2 ? 'teen' : 'kid-s', hairStyle: s, hair: P.HAIR_COLORS[(i * 3) % 16][0] }), KIT_B, '8')),
  'hair-colors': () => P.HAIR_COLORS.map((c, i) => person(c[1], A({ body: i % 2 ? 'adult-a' : 'kid', hairStyle: ['wavy', 'curly', 'ponytail', 'thin', 'afro', 'side', 'bob', 'braids'][i % 8], hair: c[0], beard: i === 9 ? 'beard' : 'none' }))),
  skins: () => { const out = []; SKIN3.forEach((s) => ['kid', 'adult-a', 'adult-b'].forEach((b) => out.push(person(s[0] + ' ' + b, { body: b, skin: s[1], hairStyle: b === 'kid' ? 'coils' : b === 'adult-a' ? 'bun' : 'buzz', hair: '#15110e', beard: b === 'adult-b' ? 'moustache' : 'none', glasses: b === 'adult-b' ? 'square' : 'none' }, b === 'kid' ? KIT_K : KIT_C)))); return out; },
  'skin-tones': () => P.SKINS.map((s, i) => person(s[1], { body: i % 2 ? 'adult-a' : 'kid', skin: s[0], hairStyle: i % 2 ? 'wavy' : 'swept', hair: i > 6 ? '#15110e' : '#3b2314', freckles: i === 1, lashes: i % 2 === 1, beard: 'none' }, KIT_C)),
  glasses: () => [person('round black kid', A({ glasses: 'round' })), person('square red kid-s', A({ body: 'kid-s', glasses: 'square', glassCol: '#c9342c' })),
    person('round gold teen', A({ body: 'teen', glasses: 'round', glassCol: '#d4a72c', hairStyle: 'side' })), person('square blue adult-a', G({ body: 'adult-a', glasses: 'square', glassCol: '#1c7ed6', beard: 'none', hairStyle: 'bob' })),
    person('round brown adult-b', G({ glasses: 'round', glassCol: '#6b4423' })), person('square black dark', G({ glasses: 'square', skin: '#4a2a18', hairStyle: 'bald', beard: 'beard' }))],
  beards: () => P.BEARDS.map((b, i) => person(b[0], G({ beard: b[0], hair: ['#15110e', '#5a3a22', '#b5562a', '#9a9a9a', '#d5d5d5'][i], hairStyle: ['short', 'side', 'tousled', 'thin', 'buzz'][i], skin: P.SKINS[i * 2][0] })))
    .concat([person('beard on dark', G({ beard: 'beard', skin: '#6b3f25', hair: '#15110e', hairStyle: 'coils' })), person('goatee teen', A({ body: 'teen', beard: 'goatee', hairStyle: 'spiky' }))]),
  acc: () => { const out = []; ['bow', 'band', 'cap'].forEach((a, ai) => ['swept', 'ponytail', 'afro', 'long'].forEach((s, si) => out.push(person(a + ' ' + s, A({ body: si % 2 ? 'kid-s' : (ai === 2 ? 'adult-a' : 'kid'), acc: a, accCol: P.ACC_COLORS[(ai * 4 + si) % 8][0], hairStyle: s, hair: P.HAIR_COLORS[(ai * 4 + si) % 9][0] }))))); return out; },
  examples: () => [
    person('girl of 9', A({ body: 'kid', hairStyle: 'ponytail', hair: '#5a3a22', skin: '#e4b48e', eyes: '#6b4423', acc: 'none', lashes: true }), KIT_B, '9', 'MAYA'),
    person('girl of 6', A({ body: 'kid-s', hairStyle: 'pigtails', hair: '#d9a441', skin: '#fbe3d0', eyes: '#3d6fa8', acc: 'bow', accCol: '#e64980', freckles: true, lashes: true }), KIT_K, '6', 'LILY'),
    person('man of 52', G({ body: 'adult-b', skin: '#f6d3b8', hairStyle: 'thin', hair: '#9a9a9a', eyes: '#6f8796', glasses: 'square', glassCol: '#25262b', beard: 'stubble' }), KIT_C, '52', 'UNCLE'),
    person('woman of 40', G({ body: 'adult-a', skin: '#c68a5c', hairStyle: 'wavy', hair: '#2a1a10', eyes: '#3f2412', beard: 'none', lashes: true }), KIT_A, '40', 'AUNTIE'),
    person('girl of 9 (cute)', A({ body: 'kid', hairStyle: 'highpony', hair: '#3b2314', skin: '#d9a273', eyes: '#3f2412', acc: 'scrunchie', accCol: '#7048e8', gems: true, lashes: true }), KIT_B, '9', 'MAYA'),
    person('girl of 6 (cute)', A({ body: 'kid-s', hairStyle: 'spacebuns', hair: '#5a3a22', skin: '#f6d3b8', eyes: '#4f7a4a', acc: 'clips', accCol: '#e64980', streaks: '#e64980', lashes: true }), KIT_C, '6', 'ZOE')
  ],
  // the newer kid looks: every new style and accessory on the two kid bodies
  cute: () => [
    person('highpony scrunchie', A({ hairStyle: 'highpony', acc: 'scrunchie', accCol: '#e64980', lashes: true, hair: '#15110e' })),
    person('spacebuns clips', A({ body: 'kid-s', hairStyle: 'spacebuns', acc: 'clips', accCol: '#7048e8', lashes: true, gems: true })),
    person('halfup bow', A({ hairStyle: 'halfup', acc: 'bow', accCol: '#f5c518', hair: '#a8824a', lashes: true })),
    person('curtain blue streaks', A({ hairStyle: 'curtain', streaks: '#3b82f6', hair: '#15110e', lashes: true, gems: true })),
    person('pigtails scrunchie', A({ body: 'kid-s', hairStyle: 'pigtails', acc: 'scrunchie', accCol: '#2f9e44', hair: '#b5562a', freckles: true, lashes: true })),
    person('bob wrist scrunchie', A({ hairStyle: 'bob', acc: 'scrunchie', accCol: '#f5c518', skin: '#6b3f25', hair: '#15110e', lashes: true })),
    person('braids purple streaks', A({ hairStyle: 'braids', streaks: '#7048e8', skin: '#a86e45', hair: '#15110e', lashes: true, acc: 'bow', accCol: '#7048e8' })),
    person('wavy band', A({ body: 'teen', hairStyle: 'wavy', acc: 'band', accCol: '#f1f3f5', hair: '#ecd28a', lashes: true }))
  ]
};

const W = 1920, CELL_H = 300;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
renderer.setPixelRatio(1);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#d7dde3');
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(6, 12, 9); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-8, 6, -10); scene.add(fill);
const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
const REST0 = [[-1.0, -0.28, 0.12], [1.0, -0.28, 0.12]];
function restArms(m, D) {
  const k = (D.L1 + D.L2) / (KID.L1 + KID.L2);
  m.arms.forEach((arm, i) => { const v = REST0[i]; arm.solve(v[0] + Math.sign(v[0]) * (D.SH_X - KID.SH_X), D.SH_Y + (v[1] - KID.SH_Y) * k, v[2] * k, 0.6, 0); });
}
const VIEWS = { front: 0, q: Math.PI / 4, side: Math.PI / 2, back: Math.PI, qb: Math.PI * 0.8 };
function triCount(model) { let t = 0; model.root.traverse((o) => { if (o.isMesh && o.visible) { const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(t); }

function render(name, opts) {
  opts = opts || {};
  const list = SECTIONS[name](), views = opts.views || ['front', 'q', 'back'], head = !!opts.head;
  const cw = opts.cw || (head ? 200 : 150), ch = opts.ch || (head ? 220 : CELL_H), per = views.length * cw, cols = Math.max(1, Math.floor((opts.W || W) / per)), rows = Math.ceil(list.length / cols);
  const w = cols * per, h = rows * (ch + 18);
  renderer.setSize(w, h, false);
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setClearColor('#d7dde3'); renderer.clear();
  // one scale for the whole section (so the bodies compare), from the tallest figure
  let H = 0; list.forEach((it) => { const D = it.dims(); H = Math.max(H, D.TOP - D.FOOT); });
  const labels = [];
  list.forEach((it, idx) => {
    const D = it.dims(), m = it.make(); restArms(m, D); scene.add(m.root);
    const tris = triCount(m);
    const cx = (idx % cols) * per, cy = Math.floor(idx / cols) * (ch + 18);
    views.forEach((v, vi) => {
      const a = VIEWS[v] != null ? VIEWS[v] : v;
      let ty, dist;
      if (head) { ty = D.NECK_Y + D.HEAD_UP + 0.05; dist = D.HEAD_R * 2.9 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.5 * 1.25; }
      else { ty = (D.FOOT + D.TOP) / 2 + (opts.y || 0); ty = D.FOOT + H * 0.5 - 0.1; dist = H * 0.58 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)); }
      cam.aspect = cw / ch; cam.updateProjectionMatrix();
      const el = opts.el != null ? opts.el : head ? 0.08 : 0.12;
      cam.position.set(Math.sin(a) * dist * Math.cos(el), ty + Math.sin(el) * dist, Math.cos(a) * dist * Math.cos(el)); cam.lookAt(0, ty, 0);
      const x = cx + vi * cw, y = h - cy - ch - 18;
      renderer.setViewport(x, y, cw, ch); renderer.setScissor(x, y, cw, ch);
      renderer.render(scene, cam);
    });
    labels.push([cx, cy + ch, it.label + '  ' + tris + ' tris']);
    scene.remove(m.root); m.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  });
  renderer.setScissorTest(false);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.drawImage(renderer.domElement, 0, 0); g.fillStyle = '#212529'; g.font = '13px system-ui, sans-serif';
  labels.forEach((l) => g.fillText(l[2], l[0] + 6, l[1] + 14));
  const url = cv.toDataURL('image/jpeg', opts.q || 0.85);
  const img = new Image(); img.src = url; document.getElementById('out').prepend(img);
  return url;
}
async function post(name, url) { await fetch('http://127.0.0.1:3561/' + name, { method: 'POST', body: url }); return name; }
window.gallery = { render, post, SECTIONS, person, A, G, tris: (av) => { const m = buildPerson({ avatar: av }); return triCount(m); }, triCount, buildPerson, buildKid, buildTata };
const btns = document.getElementById('btns');
Object.keys(SECTIONS).forEach((k) => { const b = document.createElement('button'); b.textContent = k; b.onclick = () => render(k, { head: document.getElementById('head').checked }); btns.appendChild(b); });
document.getElementById('info').textContent = 'click a section to draw it';
