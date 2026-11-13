// =====================================================================================================================
//  THE BIRTHDAY MESSAGE: change the words here for another birthday (or put S.bday = { name, lines: [...] } in the save)
// =====================================================================================================================
export var BIRTHDAY = {
  name: 'Tyson',                                                 // the name in "Happy birthday, dear ___" (blank: the save's name)
  lines: ['HAPPY BIRTHDAY TYSON', 'ICE CREAM MAN', 'LOVE, TATA']  // the cube message, one line per row (letters, digits, , . ! ? ' & -)
};
// =====================================================================================================================
//
// BIRTHDAY: the easter egg. Five quick taps on the "T" of EQUATIONS on the 3D title (js/three/title.js counts them and
// loads this module), or TataBirthday.play(). A one-shot show in the title's own stadium scene, about 55 s, then a
// still final picture with "Take a photo" and "Done":
//   a. Tyson walks to the middle of the pitch and watches; the camera eases in behind him.
//   b. All the creatures (the 15 opponents and Pip; 8 on low quality) parade in from both sides, hopping on little party
//      drums (they are upper-body figures), and line up in two curved rows in front of him; Tata runs in with them.
//   c. They sing "Happy Birthday to You" (traditional melody, public domain: js/birthday-sfx.js), with big captions,
//      mouths and bodies on the notes; then each does a few single silly moves in character.
//   d. The crowd cheers; Tata dances, then makes a heart with his hands (a soft heart glow, once).
//   e. Game cubes rain down scrambled; Bleep the robot picks them up and tosses them onto a three-step riser in reading
//      order, helpers join, then Mondo's magic hops the rest into place: the message, centred in front of Tyson.
//   f. Fireworks once (confetti only with Reduce flashing), cheers, the camera settles: a still picture.
// Any tap skips to the final picture; a second tap (or Done) ends it and gives the title back exactly as it was.
// Everything made here is disposed at the end (renderer.info checked before / after).
import * as THREE from 'three';
import { buildClassic } from './creatures/classic.js';
import { MonstersPack } from './creatures/gltfpack.js';
import { buildHuman, KID } from './creatures/kid.js';
import { TATA } from './creatures/grownup.js';
import { roundedBox } from './creatures/common.js';
import { photoCanvas, savePhoto } from './orbit.js';

var TAU = Math.PI * 2;
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
function eio(x) { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function eout(x) { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); }
function bump(u, a, d) { return Math.max(0, Math.sin(clamp((u - a) / d, 0, 1) * Math.PI)); }   // one 0..1..0 hump
function rnd(a, b) { return a + Math.random() * (b - a); }
function sv() { return (typeof S !== 'undefined' && S) ? S : { set: {} }; }

// ---------------------------------------------------------------- the words (block above, or the save's override)
function message() {
  var o = sv().bday || {}, lines = Array.isArray(o.lines) && o.lines.length ? o.lines : BIRTHDAY.lines;
  lines = lines.map(function (l) { return String(l || '').toUpperCase().replace(/[^A-Z0-9,.!?'&\- ]/g, '').replace(/\s+/g, ' ').trim(); }).filter(Boolean).slice(0, 5);
  var name = String(o.name || BIRTHDAY.name || sv().name || 'friend').trim();
  return { lines: lines, name: name };
}
// narrow screens: split long lines at spaces so each row has at most `max` cubes
function rowsFor(lines, max) {
  var out = [];
  lines.forEach(function (l) {
    if (l.length <= max) { out.push(l); return; }
    var words = l.split(' '), cur = '';
    words.forEach(function (w) { if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) out.push(cur);
  });
  return out;
}

// ---------------------------------------------------------------- the song (traditional, public domain), in C, 3/4
// [midi, beats, vowel]; the line starts are at notes 0, 6, 12, 19; "dear ___" is held a little (a fermata on "son")
var TUNE = [[67, .75, 'a'], [67, .25, 'ee'], [69, 1, 'er'], [67, 1, 'eh'], [72, 1, 'oo'], [71, 2, 'oo'],
  [67, .75, 'a'], [67, .25, 'ee'], [69, 1, 'er'], [67, 1, 'eh'], [74, 1, 'oo'], [72, 2, 'oo'],
  [67, .75, 'a'], [67, .25, 'ee'], [79, 1, 'er'], [76, 1, 'eh'], [72, 1, 'ee'], [71, 1, 'i'], [69, 3, 'a'],
  [77, .75, 'a'], [77, .25, 'ee'], [76, 1, 'er'], [72, 1, 'eh'], [74, 1, 'oo'], [72, 3, 'oo']];
var CHORDS = [[1, 'C'], [4, 'G'], [7, 'G'], [10, 'C'], [13, 'C7'], [16, 'F'], [20, 'C'], [23, 'G'], [24, 'C']];   // [beat, chord]
var CH = { C: [48, [64, 67, 72]], G: [43, [62, 65, 71]], C7: [48, [64, 70, 72]], F: [41, [65, 69, 72]] };
var LINE_AT = [0, 6, 12, 19];
function songPlan(beat) {
  var t = 0, notes = TUNE.map(function (n) { var o = { t: t, d: n[1] * beat, m: n[0], v: n[2] }; t += n[1] * beat; return o; });
  var total = t, chords = CHORDS.map(function (c, i) {
    var nb = i + 1 < CHORDS.length ? CHORDS[i + 1][0] - c[0] : 2, d = CH[c[1]];
    return { t: c[0] * beat, beats: Math.max(1, Math.min(3, nb)), bass: d[0], notes: d[1] };
  });
  return { notes: notes, chords: chords, beat: beat, total: total };
}

// ---------------------------------------------------------------- the stage plan (world units; the title's floor is FY)
var KZ = 11.4;                       // where Tyson stands to watch (centre of the pitch, facing the stage)
var ROW_FRONT_Z = 3.4, ROW_DZ = 1.55; // the message riser: front row on the grass, each row behind one step higher
var CS = 1.12, CP = 1.25;
var TATA_SPOT = { x: -1.9, z: 7.4 }; // where Tata makes the heart (a little to the side, so the camera sees him past Tyson)            // message cube size and pitch
var POD_FRONT = 0.85, POD_BACK = 1.5; // the party drums the creatures stand on (front row lower, back row higher: a choir)
var CRE_H = 2.8;                     // a typical creature's height on its drum (all share one scale, as at the table)

var H = null, X = null;              // H: the title's hooks; X: the running show (null when none)
var matCache = null, geoShared = null, cssDone = false, sfxLoad = null;

function loadCss() {
  if (cssDone) return; cssDone = true;
  try { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/birthday.css'; document.head.appendChild(l); } catch (e) {}
}
function loadSfx() {
  if (window.BirthdaySfx) return Promise.resolve(window.BirthdaySfx);
  if (!sfxLoad) sfxLoad = import('../birthday-sfx.js').then(function () { return window.BirthdaySfx || null; }, function () { return null; });
  return sfxLoad;
}
function calm() { try { return H.calm(); } catch (e) { return false; } }

// who comes: the 15 opponents (Monster League ones only when that pack is ready) and Pip; fewer on low quality
function castList(qi) {
  var list = [], O = (typeof OPPONENTS !== 'undefined') ? OPPONENTS : [];
  O.forEach(function (o, i) { list.push({ kind: o.kind || 'sloth', pack: o.pack === 'monsters' ? 'monsters' : 'classic', name: o.name || '', i: i }); });
  if (!list.length) ['sloth', 'penguin', 'fox', 'owl', 'wizard', 'robot', 'bat', 'octopus', 'dragon', 'chameleon'].forEach(function (k, i) { list.push({ kind: k, pack: 'classic', name: k, i: i }); });
  list.push({ kind: 'pip', pack: 'classic', name: 'Pip', i: 99 });
  if (qi === 0) list = list.filter(function (c) { return c.pack === 'classic'; }).filter(function (c, k) { return ['pip', 'robot', 'wizard', 'penguin', 'fox', 'dragon', 'octopus', 'owl'].indexOf(c.kind) >= 0; });
  return list;
}
// wait (at most `ms`) for the glTF monsters; the ones that are not ready simply stay home
function readyMonsters(list, ms) {
  var want = list.filter(function (c) { return c.pack === 'monsters'; });
  if (!want.length) return Promise.resolve(list);
  var timer = new Promise(function (res) { setTimeout(function () { res('late'); }, ms); });
  var load = Promise.resolve().then(function () { return MonstersPack.probe(); }).then(function (ok) {
    if (!ok) return false;
    return Promise.all(want.map(function (c) { return MonstersPack.has(c.kind) ? MonstersPack.load(c.kind).then(function () { c.ready = true; }, function () {}) : null; }));
  }).catch(function () { return false; });
  return Promise.race([load, timer]).then(function () { return list.filter(function (c) { return c.pack !== 'monsters' || (c.ready && MonstersPack.has(c.kind)); }); });
}

// ---------------------------------------------------------------- shared bits (made once per show, freed at the end)
var DRUM_COLS = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xffd43b, 0xb197fc, 0xff922b, 0x22b8cf, 0xf783ac];
function shared() {
  var g = {
    drum: new THREE.CylinderGeometry(1.05, 1.18, 1, 28, 1), cap: new THREE.CylinderGeometry(1.08, 1.08, 0.08, 28, 1),
    rim: new THREE.TorusGeometry(1.08, 0.08, 8, 32), step: roundedBox(1, 1, 1, 0.06, 2), dot: null, star: null, heart: null
  };
  g.rim.rotateX(Math.PI / 2);
  var m = { drums: DRUM_COLS.map(function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.08 }); }),
    cap: new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.5 }), rim: new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.3, metalness: 0.45, emissive: 0x3a2600 }),
    riser: new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.55, metalness: 0.05 }), trim: new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.3, metalness: 0.4, emissive: 0x4a3000 }) };
  g.dot = spriteTex('dot'); g.star = spriteTex('star'); g.heart = spriteTex('heart');
  return { g: g, m: m };
}
function spriteTex(kind) {
  var cv = document.createElement('canvas'); cv.width = cv.height = 128; var c = cv.getContext('2d');
  if (kind === 'dot') { var gr = c.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }
  else if (kind === 'star') {
    var g2 = c.createRadialGradient(64, 64, 4, 64, 64, 60); g2.addColorStop(0, 'rgba(255,250,200,.9)'); g2.addColorStop(1, 'rgba(255,230,120,0)'); c.fillStyle = g2; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#ffe066'; c.strokeStyle = '#fff6c2'; c.lineWidth = 4; c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 14 : 34; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    c.closePath(); c.fill(); c.stroke();
  } else {   // a heart: a soft glow behind a rounded heart shape
    var g3 = c.createRadialGradient(64, 66, 6, 64, 66, 62); g3.addColorStop(0, 'rgba(255,140,170,.85)'); g3.addColorStop(1, 'rgba(255,90,130,0)'); c.fillStyle = g3; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#ff4d79'; c.strokeStyle = '#fff0f4'; c.lineWidth = 5; c.beginPath(); c.moveTo(64, 98);
    c.bezierCurveTo(20, 70, 26, 30, 50, 32); c.bezierCurveTo(58, 33, 63, 40, 64, 46); c.bezierCurveTo(65, 40, 70, 33, 78, 32); c.bezierCurveTo(102, 30, 108, 70, 64, 98);
    c.closePath(); c.fill(); c.stroke();
  }
  var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- the creatures (on their party drums)
function makeCreature(c, k, back) {
  var actor = c.pack === 'monsters' ? MonstersPack.build(c.kind) : buildClassic(c.kind);
  var s = CRE_H / 4 * (actor.fit || 1), P = H.neutralP(), podH = back ? POD_BACK : POD_FRONT, g = new THREE.Group();
  if (actor.lean) P.lean += actor.lean;
  var drum = new THREE.Mesh(X.sh.g.drum, X.sh.m.drums[k % DRUM_COLS.length]); drum.scale.y = podH; drum.position.y = podH / 2; g.add(drum);
  var rim = new THREE.Mesh(X.sh.g.rim, X.sh.m.rim); rim.position.y = podH; g.add(rim);
  actor.root.scale.setScalar(s); actor.root.position.y = podH + 0.03 + (actor.fitY || 0) * s; g.add(actor.root);
  var sh = !!H.B.shadowsOn; g.traverse(function (o) { if (o.isMesh) o.castShadow = sh; });
  g.visible = false; X.scene.add(g);
  return { c: c, kind: c.kind, pack: c.pack, actor: actor, P: P, base: Object.assign({}, P), s: s, g: g, podH: podH, x: 0, z: 0, yaw: 0, mv: null, moves: [], tg: [new THREE.Vector3(), new THREE.Vector3()], open: 0.5, held: null };
}
var _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function angLerp(a, b, t) { var d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; }
// a hop-along move: n hops from where it is to (x1, z1), turning to face along the way and to `yaw1` at the end
function moveTo(p, x1, z1, t0, dur, yaw1, hops, hh) {
  p.mv = { x0: p.x, z0: p.z, x1: x1, z1: z1, t0: t0, dur: dur, yaw1: yaw1, hops: hops || Math.max(1, Math.round(dur / 0.42)), hh: hh == null ? 0.9 : hh };
}
function stepMove(p, t) {
  var m = p.mv; if (!m || t < m.t0) return null;
  var u = clamp((t - m.t0) / m.dur, 0, 1), ph = u * m.hops, hop = Math.abs(Math.sin(ph * Math.PI)) * m.hh;
  p.x = lerp(m.x0, m.x1, u); p.z = lerp(m.z0, m.z1, u);
  var dx = m.x1 - m.x0, dz = m.z1 - m.z0, travel = Math.hypot(dx, dz) > 0.3 ? Math.atan2(dx, dz) : m.yaw1;
  p.yaw = u < 0.8 ? angLerp(p.yaw, travel, 0.3) : angLerp(travel, m.yaw1, sstep((u - 0.8) / 0.2));
  var land = ph % 1, sq = u < 1 && (land < 0.1 || land > 0.92) ? 0.1 : 0;
  if (u >= 1) { p.mv = null; p.x = m.x1; p.z = m.z1; p.yaw = m.yaw1; }
  return { hop: hop, sq: sq, u: u };
}

// the single moves (each plays once): fn(p, u, a) writes into p.P and, through a, the arm targets and the drum's hop
var MOVES = {
  wave: function (p, u, a) { var up = sstep(u / 0.2) * (1 - sstep((u - 0.8) / 0.2)), sw = Math.sin(clamp((u - 0.2) / 0.6, 0, 1) * TAU * 2) * 0.38; a.arm(1, 1.45 + sw, 3.05, 0.85, up); p.P.smile = 1; p.P.headRoll = -0.08 * up; },
  hop: function (p, u, a) { var b = bump(u, 0.1, 0.8); a.y += b * 1.4; a.sq = u < 0.12 ? 0.12 * (1 - u / 0.12) : u > 0.88 ? 0.12 * (u - 0.88) / 0.12 : -0.05; a.armsUp(b * 0.8); p.P.open = 0.5 * b; },
  spin: function (p, u, a) { a.yaw += eio(u) * TAU; a.y += bump(u, 0, 1) * 0.5; p.P.smile = 1; p.P.eyeWide = 0.3; a.armsOut(bump(u, 0, 1)); },
  cheer: function (p, u, a) { var k = sstep(u / 0.2) * (1 - sstep((u - 0.82) / 0.18)); a.armsUp(k); p.P.open = 0.7 * k; p.P.smile = 1; p.P.eyeWide = 0.3 * k; a.y += bump(u, 0.05, 0.4) * 0.5; },
  clap: function (p, u, a) { var k = sstep(u / 0.15) * (1 - sstep((u - 0.85) / 0.15)), c = Math.abs(Math.sin(clamp((u - 0.15) / 0.7, 0, 1) * Math.PI * 3)); a.arm(0, 0.25 + 0.6 * c, 1.3, 1.45, k); a.arm(1, 0.25 + 0.6 * c, 1.3, 1.45, k); p.P.smile = 1; },
  bow: function (p, u, a) { var k = bump(u, 0, 1); p.P.lean += 0.45 * k; p.P.headPitch += 0.2 * k; a.arm(0, 1.1, 0.6, 0.9, k); a.arm(1, 1.1, 0.6, 0.9, k); p.P.lid = 0.5; },
  robot: function (p, u, a) { var st = Math.min(5, Math.floor(u * 6)); p.P.glow = (st % 2 === 0 && u < 0.95) ? 1.3 : 0.15; p.P.headYaw = [0, 0.5, 0.5, -0.5, -0.5, 0][st]; a.arm(0, 1.2, st % 2 ? 2.4 : 1.2, 1.4, 1); a.arm(1, 1.2, st % 2 ? 1.2 : 2.4, 1.4, 1); },
  smoke: function (p, u, a) { p.P.steam = 1; p.P.steamT = u * 1.7; p.P.headPitch -= 0.15 * bump(u, 0, 1); p.P.lid = 0.6; p.P.smile = 0.9; },
  arms: function (p, u, a) { var k = sstep(u / 0.15) * (1 - sstep((u - 0.85) / 0.15)); for (var i = 0; i < 2; i++) a.arm(i, 1.9, 1.7 + Math.sin(u * TAU * 2 + i * Math.PI) * 1.2, 0.8, k); p.P.smile = 1; p.P.headRoll = Math.sin(u * TAU * 2) * 0.12 * k; },
  stars: function (p, u, a) { var k = sstep(u / 0.2) * (1 - sstep((u - 0.8) / 0.2)); a.armsUp(k); p.P.smile = 1; if (!a.st.fired && u > 0.25) { a.st.fired = true; burst('star', p.x, H.FY + p.podH + CRE_H + 0.4, p.z, 9); } },
  owl: function (p, u, a) { p.P.headYaw = Math.sin(u * Math.PI) * 1.35; p.P.eyeWide = 0.5 * bump(u, 0, 1); p.P.smile = 0.9; },
  wings: function (p, u, a) { var k = sstep(u / 0.2) * (1 - sstep((u - 0.8) / 0.2)), f = 1.6 + 0.4 * Math.sin(u * TAU * 2); a.arm(0, 2.3, f, 0.3, k); a.arm(1, 2.3, f, 0.3, k); a.y += bump(u, 0.2, 0.6) * 0.8; p.P.open = 0.4 * k; },
  yawn: function (p, u, a) { var k = bump(u, 0, 1); a.armsUp(k); p.P.open = 0.9 * k; p.P.lid = 0.95 - 0.6 * k; p.P.headPitch -= 0.2 * k; },
  slide: function (p, u, a) { var k = bump(u, 0, 1); p.P.sway = 0.35 * Math.sin(u * TAU); a.x += Math.sin(u * TAU) * 0.6; a.armsOut(k); p.P.smile = 1; }
};
var SILLY = { sloth: ['yawn', 'wave', 'hop'], penguin: ['slide', 'clap', 'spin'], fox: ['spin', 'wave', 'hop'], owl: ['owl', 'hop', 'wave'], wizard: ['stars', 'spin', 'bow'],
  robot: ['robot', 'spin', 'robot'], bat: ['wings', 'hop', 'spin'], octopus: ['arms', 'spin', 'arms'], dragon: ['smoke', 'hop', 'smoke'], chameleon: ['spin', 'wave', 'bow'], pip: ['hop', 'spin', 'cheer'] };
function sillyFor(p) { return p.pack === 'monsters' ? ['hop', 'wave', 'spin'] : (SILLY[p.kind] || ['hop', 'wave', 'spin']); }
function queue(p, name, t0, dur) { p.moves.push({ name: name, t0: t0, dur: dur || 1.2, st: {} }); }

// the song as the creatures act it: which note is sounding at show time t (or null)
function noteAt(t) {
  var sg = X.song; if (!sg) return null;
  var u = t - sg.t0; if (u < 0 || u > sg.plan.total + 0.4) return null;
  var ns = sg.plan.notes;
  for (var i = 0; i < ns.length; i++) if (u >= ns[i].t && u < ns[i].t + ns[i].d) return { i: i, n: ns[i], u: u, k: (u - ns[i].t) / ns[i].d };
  return null;
}
function lineOf(i) { var l = 0; for (var j = 0; j < LINE_AT.length; j++) if (i >= LINE_AT[j]) l = j; return l; }

var ACC = { x: 0, y: 0, yaw: 0, sq: 0, st: null, p: null,
  arm: function (i, ax, ay, az, k) { var p = this.p, sd = p.actor.arms[i].side || (i ? 1 : -1); _v.set(sd * ax, ay, az); p.tg[i].lerp(_v, clamp(k, 0, 1)); },
  armsUp: function (k) { this.arm(0, 1.35, 2.7, 0.7, k); this.arm(1, 1.35, 2.7, 0.7, k); },
  armsOut: function (k) { this.arm(0, 2.0, 1.2, 0.6, k); this.arm(1, 2.0, 1.2, 0.6, k); } };
function stepCreature(p, t, now) {
  var P = p.P, b = p.base, a = ACC, k;
  for (k in b) P[k] = b[k];
  P.smile = 0.75; P.glow = 0; P.steam = 0; P.steamT = 0; P.gazeCam = 0.4;
  a.x = 0; a.y = 0; a.yaw = 0; a.sq = 0; a.p = p;
  for (var i = 0; i < 2; i++) { var sd = p.actor.arms[i].side || (i ? 1 : -1); p.tg[i].set(sd * 1.3, 0.45, 1.05); }
  var mv = stepMove(p, t);
  if (mv) { a.y += mv.hop; a.sq += mv.sq; P.smile = 1; P.open = 0.25; a.armsOut(0.35); }
  // singing: the mouth opens on every note, a little bob on the beat, a sway per bar, arms open; "dear ___": arms toward him
  var na = noteAt(t);
  if (na && !p.mv) {
    var env = sstep(na.k / 0.12) * (1 - 0.35 * sstep((na.k - 0.6) / 0.4)), ln = lineOf(na.i), su = na.u / X.song.plan.beat;
    P.open = 0.25 + 0.55 * env * (na.n.v === 'oo' ? 0.7 : 1); P.mouthW = na.n.v === 'oo' ? 0.75 : na.n.v === 'ee' ? 1.15 : 1; P.smile = 0.9;
    P.headRoll = Math.sin((su / 3 + p.ph) * Math.PI) * 0.09; P.headPitch -= 0.06;
    a.y += Math.pow(Math.max(0, Math.cos((su % 3) / 3 * TAU)), 6) * 0.18;
    if (ln === 2 && na.i >= 16) a.arm(0, 1.2, 1.5, 2.0, 0.8), a.arm(1, 1.2, 1.5, 2.0, 0.8);
    else if (na.i >= 23) a.armsUp(sstep((na.u - X.song.plan.notes[23].t) / 0.4));
    else a.armsOut(0.45);
  }
  // queued moves (each once)
  for (var j = p.moves.length - 1; j >= 0; j--) {
    var m = p.moves[j];
    if (t >= m.t0 + m.dur) { p.moves.splice(j, 1); continue; }
    if (t >= m.t0 && MOVES[m.name]) { a.st = m.st; MOVES[m.name](p, (t - m.t0) / m.dur, a); }
  }
  if (p.hold) { var h = p.hold; if (h.lean) P.lean += h.lean; a.arm(0, 0.72, h.y, h.z, h.k); a.arm(1, 0.72, h.y, h.z, h.k); p.open = 0.15; } else p.open = 0.5;
  var g = p.g, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  g.position.set(p.x + a.x * c, H.FY + a.y, p.z - a.x * s); g.rotation.y = p.yaw + a.yaw;
  g.scale.set(1 + a.sq * 0.5, 1 - a.sq, 1 + a.sq * 0.5);
  var ac = p.actor; ac.apply(P, now);
  for (var q = 0; q < 2; q++) { var arm = ac.arms[q]; _w.copy(p.tg[q]).applyMatrix4(ac.invBody); arm.open = p.open; arm.solve(_w.x, _w.y, _w.z, 0.5, 0); }
}
// a point in front of a creature's hands, in world space (where a held cube goes)
function handPoint(p, out) {
  var h = p.hold || { y: 1.2, z: 1.5 }; out.set(0, h.y - 0.25, h.z + 0.25).multiplyScalar(p.s);
  out.y += p.podH + 0.03; out.applyAxisAngle(_Y, p.g.rotation.y); out.add(p.g.position); return out;
}
var _Y = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- the people: Tyson (watching) and Tata (dancing)
function makeHuman(who) {
  var sp = null, s0 = sv();
  try { if (window.T3 && T3.playerSpec) sp = T3.playerSpec(who === 'tata' ? { who: 'tata' } : { who: 'kid', number: s0.jersey || '7' }); } catch (e) { sp = null; }
  if (!sp) return null;
  var model = buildHuman({ dims: sp.dims, kit: sp.kit, num: sp.num, name: sp.name, look: sp.look, front: true });
  var D = sp.dims || KID, s = H.KID_H / ((KID.TOP - KID.FOOT) || 5.7);
  model.root.scale.setScalar(s);
  var sh = !!H.B.shadowsOn; model.root.traverse(function (o) { if (o.isMesh) o.castShadow = sh; });
  model.root.visible = false; X.scene.add(model.root);
  return { model: model, s: s, dims: D, foot: D.FOOT, x: 0, z: 0, yaw: 0, mv: null, moves: [], face: {}, who: who };
}
function mapArm(hm, v) {
  var D = hm.dims; if (D === KID) return v;
  var r = (D.L1 + D.L2) / (KID.L1 + KID.L2); v.x = v.x + Math.sign(v.x) * (D.SH_X - KID.SH_X); v.y = D.SH_Y + (v.y - KID.SH_Y) * r; v.z *= r; return v;
}
// arm targets in his own units (arm 0 = his right hand, at -x), blended from the hang pose
var HANG = [[-1.0, -0.28, 0.12], [1.0, -0.28, 0.12]], HIPS = [[-0.74, 0.25, 0.08], [0.74, 0.25, 0.08]];
var HUM = { tg: [new THREE.Vector3(), new THREE.Vector3()], open: [0.3, 0.3], al: [0.2, 0.2], face: null, knees: [0, 0, 0, 0], bodyX: 0, bodyZ: 0, bodyY: 0, headY: 0, headX: 0, y: 0, yaw: 0,
  arm: function (i, x, y, z, k) { this.tg[i].lerp(_v.set(x, y, z), clamp(k, 0, 1)); } };
function stepHuman(hm, t) {
  var m = hm.model, A = HUM, i;
  for (i = 0; i < 2; i++) { var base = hm.rest === 'hips' ? HIPS[i] : HANG[i]; A.tg[i].set(base[0], base[1], base[2]); A.open[i] = 0.3; A.al[i] = 0.2; }
  A.face = { mouth: { smile: 0.8 } }; A.knees = [0, 0, 0, 0]; A.bodyX = 0; A.bodyZ = 0; A.bodyY = 0; A.headY = 0; A.headX = 0.04; A.y = 0; A.yaw = 0;
  var mv = stepWalk(hm, t);
  for (var j = hm.moves.length - 1; j >= 0; j--) {
    var mo = hm.moves[j];
    if (t >= mo.t0 + mo.dur && !mo.hold) { hm.moves.splice(j, 1); continue; }
    if (t >= mo.t0 && HMOVES[mo.name]) HMOVES[mo.name](hm, clamp((t - mo.t0) / mo.dur, 0, 1), A, mo, t);
  }
  m.setKnees(A.knees[0], A.knees[1], A.knees[2], A.knees[3]);
  m.body.rotation.set(A.bodyX, A.bodyY, A.bodyZ); m.neck.rotation.set(0.02, 0, 0); m.head.rotation.set(A.headX, A.headY, 0);
  if (m.legs) { m.legs[0].rotation.z = -0.07; m.legs[1].rotation.z = 0.07; }
  m.root.position.set(hm.x, H.FY - hm.foot * hm.s + A.y, hm.z); m.root.rotation.set(0, hm.yaw + A.yaw, 0);
  for (i = 0; i < 2; i++) { _v.copy(A.tg[i]); mapArm(hm, _v); var arm = m.arms[i]; arm.open = A.open[i]; arm.setShoulderLift(0); arm.solve(_v.x, _v.y, _v.z, A.al[i], 0); }
  m.setFace(A.face);
}
// walking / running: legs and arms swing, a small bob (hm.mv from moveTo, without hops)
function stepWalk(hm, t) {
  var m = hm.mv; if (!m || t < m.t0) return null;
  var u = clamp((t - m.t0) / m.dur, 0, 1), e = sstep(u), A = HUM;
  hm.x = lerp(m.x0, m.x1, e); hm.z = lerp(m.z0, m.z1, e);
  var dx = m.x1 - m.x0, dz = m.z1 - m.z0, travel = Math.atan2(dx, dz);
  hm.yaw = u < 0.85 ? angLerp(hm.yaw, travel, 0.25) : angLerp(travel, m.yaw1, sstep((u - 0.85) / 0.15));
  var speed = Math.sin(u * Math.PI) * (m.run ? 1 : 0.6), ph = (t - m.t0) * (m.run ? 15 : 10), sw = Math.sin(ph) * 0.7 * speed;
  A.knees = [-sw, sw, 0.2 + Math.max(0, Math.sin(ph)) * speed, 0.2 + Math.max(0, -Math.sin(ph)) * speed];
  A.bodyX = 0.15 * speed; A.y = Math.abs(Math.sin(ph)) * 0.18 * hm.s * speed;
  for (var i = 0; i < 2; i++) { var q = Math.sin(ph) * (i ? -1 : 1) * speed; A.arm(i, i ? 0.95 : -0.95, 0.1 + 0.25 * Math.abs(q), 0.15 + 0.6 * q, 1); }
  A.face = { mouth: { big: 0.5 } };
  if (u >= 1) { hm.mv = null; hm.x = m.x1; hm.z = m.z1; hm.yaw = m.yaw1; }
  return u;
}
function walkTo(hm, x1, z1, t0, dur, yaw1, run) { hm.mv = { x0: hm.x, z0: hm.z, x1: x1, z1: z1, t0: t0, dur: dur, yaw1: yaw1, run: !!run }; }
function hq(hm, name, t0, dur, hold) { hm.moves.push({ name: name, t0: t0, dur: dur, hold: !!hold, st: {} }); }

// his single moves: fn(hm, u, A, mo, t)
var HMOVES = {
  // Tata dances: knees bounce on the beat, a sway per bar, the arms take turns going up (it ends when the song does)
  dance: function (hm, u, A, mo, t) {
    var beat = X.song ? X.song.plan.beat : 0.56, bt = (t - mo.t0) / beat, k = sstep(u * mo.dur / 0.4) * (1 - sstep((u * mo.dur - mo.dur + 0.5) / 0.5));
    var bar = Math.floor(bt / 3), on = Math.pow(Math.max(0, Math.cos((bt % 1) * TAU)), 3);
    A.knees = [-0.1 * k, -0.1 * k, 0.35 * on * k, 0.35 * on * k]; A.y -= 0.12 * hm.s * on * k;
    A.bodyZ = Math.sin(bt / 3 * Math.PI) * 0.13 * k; A.headY = Math.sin(bt / 3 * Math.PI) * 0.15 * k;
    var up = bar % 2, pump = 0.25 * on;
    A.arm(up, up ? 0.95 : -0.95, 3.1 + pump, 0.35, k); A.arm(1 - up, up ? -0.85 : 0.85, 0.5, 0.55, k); A.open[up] = 0.1;
    A.face = { mouth: { big: 0.6 + 0.3 * on }, squint: 0.35 };
  },
  // the heart: both hands up in front of his chin, wrists together at the bottom, fingers curved in to meet at the top
  heart: function (hm, u, A, mo, t) {
    var s = u * mo.dur, k = sstep(s / 0.5) * (1 - sstep((s - mo.dur + 0.6) / 0.6));
    A.arm(0, -0.22, 2.08, 1.0, k); A.arm(1, 0.22, 2.08, 1.0, k); A.al[0] = A.al[1] = 0; A.open[0] = A.open[1] = 0.05;
    A.headX = 0.04 - 0.08 * k; A.bodyZ = 0.05 * Math.sin(s * 1.6) * k;
    A.face = { mouth: { smile: 0.4, big: 0.25 }, squint: 0.45 * k, browUp: 0.25 * k };
    if (!mo.st.glow && s > 0.55) { mo.st.glow = true; heartGlow(hm, t, mo.dur - 0.9); }
  },
  cheer: function (hm, u, A) { var k = sstep(u / 0.15) * (1 - sstep((u - 0.8) / 0.2)), hop = bump(u, 0.12, 0.3); A.arm(0, -0.86, 3.45, 0.22, k); A.open[0] = 0; A.y += hop * 0.5 * hm.s; if (hop > 0) A.knees = [-0.15, -0.15, 0.3, 0.3]; A.face = { mouth: { big: 1 * k }, squint: 0.45 }; },
  clap: function (hm, u, A) { var k = sstep(u / 0.12) * (1 - sstep((u - 0.85) / 0.15)), c = Math.abs(Math.sin(u * Math.PI * 4)); A.arm(0, -0.12 - 0.4 * c, 1.25, 0.95, k); A.arm(1, 0.12 + 0.4 * c, 1.25, 0.95, k); A.al[0] = A.al[1] = 0.6; A.face = { mouth: { big: 0.7 } }; },
  wave: function (hm, u, A) { var k = sstep(u / 0.2) * (1 - sstep((u - 0.8) / 0.2)), sw = Math.sin(clamp((u - 0.2) / 0.6, 0, 1) * TAU * 1.5) * k; A.arm(0, -1.2 + 0.28 * sw, 2.95, 0.4, k); A.open[0] = 1; A.face = { mouth: { big: 0.7 } }; },
  look: function (hm, u, A, mo) { var k = bump(u, 0, 1); A.headY = (mo.st.dir || 0.3) * k; A.headX = -0.08 * k; },
  hips: function (hm, u, A) { var k = sstep(u); for (var i = 0; i < 2; i++) A.arm(i, HIPS[i][0], HIPS[i][1], HIPS[i][2], k); }
};

// ---------------------------------------------------------------- little sprites: stars, hearts, smoke (one pool)
function sprites() {
  var pool = [];
  for (var i = 0; i < 36; i++) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.sh.g.star, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    s.visible = false; s.renderOrder = 6; s.userData = {}; X.scene.add(s); pool.push(s);
  }
  return pool;
}
function burst(kind, x, y, z, n) {
  if (!X || !X.spr) return;
  var tex = kind === 'heart' ? X.sh.g.heart : kind === 'puff' ? X.sh.g.dot : X.sh.g.star;
  for (var i = 0, made = 0; i < X.spr.length && made < n; i++) {
    var s = X.spr[i]; if (s.visible) continue;
    var u = s.userData, a = rnd(0, TAU), r = rnd(0.3, 1);
    s.material.map = tex; s.material.color.set(kind === 'puff' ? 0xdfe3ea : 0xffffff); s.material.opacity = 1;
    u.t0 = X.t; u.life = kind === 'heart' ? rnd(1.6, 2.4) : rnd(0.8, 1.3); u.vx = Math.cos(a) * r * (kind === 'heart' ? 0.8 : 2.4); u.vy = kind === 'heart' ? rnd(1.2, 2.0) : rnd(1.2, 3.2); u.vz = Math.sin(a) * r * 1.2 + (kind === 'heart' ? 0.6 : 0.5);
    u.size = kind === 'heart' ? rnd(0.5, 0.8) : rnd(0.45, 0.8); u.g = kind === 'heart' ? -0.2 : 2.8;
    s.position.set(x + Math.cos(a) * 0.3, y, z); s.visible = true; s.scale.setScalar(0.01); made++;
  }
}
function stepSprites(dt) {
  var busy = false;
  X.spr.forEach(function (s) {
    if (!s.visible || s === X.bigHeart) return;
    var u = s.userData, k = (X.t - u.t0) / u.life;
    if (k >= 1) { s.visible = false; return; }
    busy = true; s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt; u.vy -= u.g * dt;
    s.scale.setScalar(u.size * Math.sin(Math.PI * Math.min(1, k * 1.5)) + 0.02); s.material.opacity = 1 - k * k;
  });
  return busy;
}
// one soft heart grows between Tata's hands, glows while he holds it, a few little hearts float up, then it fades
function heartGlow(hm, t, hold) {
  var s = null; for (var i = 0; i < X.spr.length; i++) if (!X.spr[i].visible) { s = X.spr[i]; break; }
  if (!s) return;
  s.material.map = X.sh.g.heart; s.material.color.set(0xffffff); s.material.opacity = 0; s.visible = true; X.bigHeart = s;
  X.heart = { s: s, hm: hm, t0: t, hold: Math.max(1.2, hold) };
  if (H.sfx()) H.sfx().play('sparkle', 0, {}, true);
}
function stepHeart() {
  var h = X.heart; if (!h) return false;
  var s = h.s, u = X.t - h.t0, k = sstep(u / 0.45) * (1 - sstep((u - h.hold) / 0.5));
  var hm = h.hm, y = H.FY + (hm.dims.TOP - hm.foot) * hm.s + 0.5 + 0.5 * sstep(u / 1.2);   // just above his head, rising a little
  _v.set(0, 0, 0.5 * hm.s).applyAxisAngle(_Y, hm.yaw); s.position.set(hm.x + _v.x, y, hm.z + _v.z);
  s.scale.setScalar(0.2 + 1.9 * k * (1 + 0.04 * Math.sin(u * 5))); s.material.opacity = k;
  if (!h.burst && u > 0.6) { h.burst = true; burst('heart', s.position.x, s.position.y + 0.3, s.position.z, 7); }
  if (u > h.hold + 0.55) { s.visible = false; X.bigHeart = null; X.heart = null; }
  return true;
}

// ---------------------------------------------------------------- the message cubes and the riser they stand on
function buildMessage(rows) {
  var FY = H.FY, R = rows.length, colors = ['red', 'blue', 'green', 'black'], ck = 0;
  var faces = (window.Eq && Eq.CUBE_FACES) || { red: ['0', '1', '2', '3', '+', '-'], blue: ['4', '5', '6', '7', '*', '/'], green: ['8', '9', '0', '1', '+', '-'], black: ['2', '3', '4', '5', '*', '/'] };
  var need = {}, list = [], cubes = [], maxN = 0;
  function cell(color, s, letter) { var k = color + '|' + s + (letter ? '|L' : ''); if (!need[k]) { need[k] = 1; list.push({ key: k, color: color, s: s, letter: letter }); } return k; }
  rows.forEach(function (line, r) {
    var n = line.length, lvl = R - 1 - r; maxN = Math.max(maxN, n);
    line.split('').forEach(function (ch, j) {
      if (ch === ' ') return;
      var color = colors[ck++ % 4], f = faces[color] || faces.red, keys = [];
      for (var k = 0; k < 6; k++) keys.push(cell(color, f[(k + j) % f.length], false));
      keys[4] = cell(color, ch, true); keys[2] = cell(color, ch, true);   // the letter in front and on top (it shows wherever it lands)
      cubes.push({ ch: ch, color: color, keys: keys, r: r, j: j, slot: new THREE.Vector3((j - (n - 1) / 2) * CP, FY + (lvl + 1) * CS + CS / 2, ROW_FRONT_Z - lvl * ROW_DZ) });
    });
  });
  var atlas = H.buildAtlas(list, H.qLevel() >= 2 ? 192 : 128); X.own.tex.push(atlas.tex);
  var mat = new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.3, metalness: 0, envMapIntensity: 1.1 }); X.own.mat.push(mat);
  var sh = !!H.B.shadowsOn;
  cubes.forEach(function (c, i) {
    c.m = new THREE.Mesh(H.cubeGeometry(CS, atlas, c.keys), mat); c.m.castShadow = sh; c.m.receiveShadow = sh; c.m.visible = false; c.i = i;
    X.scene.add(c.m);
  });
  // the riser: one step per row behind the front one, gold trim on each step's edge
  var riser = new THREE.Group(), W = maxN * CP + 1.4;
  for (var L = 1; L <= R; L++) {   // every row stands on a step (the front row too), so the words sit above Tyson's head
    var zc = ROW_FRONT_Z - (L - 1) * ROW_DZ;
    var b = new THREE.Mesh(X.sh.g.step, X.sh.m.riser); b.scale.set(W, L * CS, ROW_DZ); b.position.set(0, FY + L * CS / 2, zc); b.receiveShadow = sh; riser.add(b);
    var tr = new THREE.Mesh(X.sh.g.step, X.sh.m.trim); tr.scale.set(W + 0.04, 0.1, 0.1); tr.position.set(0, FY + L * CS - 0.05, zc + ROW_DZ / 2 + 0.02); riser.add(tr);
  }
  riser.visible = false; X.scene.add(riser);
  return { cubes: cubes, riser: riser, R: R, W: W, rows: rows };
}
// where each cube lands when it rains down: scattered on the grass between the riser and Tyson, never on top of another
function scatter(cubes) {
  var FY = H.FY, placed = [];
  cubes.forEach(function (c) {
    var x, z, ok = false, tries = 0;
    while (!ok && tries++ < 60) { x = rnd(-10, 10); z = rnd(ROW_FRONT_Z + 1.9, KZ - 1.4); ok = Math.abs(x) > 1.6 || z < KZ - 2.6; for (var i = 0; ok && i < placed.length; i++) if (Math.hypot(placed[i][0] - x, placed[i][1] - z) < CS * 1.3) ok = false; }
    placed.push([x, z]);
    var flips = [[0, 0, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0], [0, 0, Math.PI / 2], [0, 0, -Math.PI / 2], [Math.PI, 0, 0]], f = flips[Math.floor(Math.random() * 6)];
    _e.set(f[0], rnd(-Math.PI, Math.PI), f[2], 'YXZ'); c.restQ = new THREE.Quaternion().setFromEuler(_e);
    if (Math.random() < 0.55) { _e.set(0, rnd(-Math.PI, Math.PI), 0); c.restQ.setFromEuler(_e); c.restQ.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -Math.PI / 2)); }   // lying letter-up (readable jumble)
    c.ground = new THREE.Vector3(x, FY + CS / 2, z);
    c.axis = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); c.spin = rnd(5, 9) * (Math.random() < 0.5 ? -1 : 1);
  });
}
var GRAV = 26, _ID = new THREE.Quaternion();
// fall from the sky (t0), a little bounce, lie still; state then moves on to 'held' / 'fly' / 'placed'
function stepCube(c, t) {
  var m = c.m;
  if (c.state === 'fall') {
    if (t < c.t0) { m.visible = false; return true; }
    m.visible = true;
    var tf = Math.sqrt(2 * c.h / GRAV), u = t - c.t0, y, sq = 0;
    if (u < tf) y = c.ground.y + c.h - GRAV / 2 * u * u;
    else { var ub = u - tf, tb = 0.26; y = c.ground.y + Math.max(0, 1.3 * ub - GRAV / 2 * ub * ub) * (ub < tb ? 1 : 0); if (ub < 0.12) sq = 0.14 * (1 - ub / 0.12); }
    if (!c.thud && u >= tf) { c.thud = true; if (H.sfx() && !X.quiet) H.sfx().play('thud', 0, { v: 0.35 + Math.random() * 0.2, pan: clamp(c.ground.x / 14, -0.9, 0.9) }, true); }
    m.position.set(c.ground.x, y - CS * sq / 2, c.ground.z); m.scale.set(1 + sq * 0.4, 1 - sq, 1 + sq * 0.4);
    m.quaternion.copy(c.restQ).multiply(_q.setFromAxisAngle(c.axis, c.spin * (1 - eout(clamp(u / (tf + 0.15), 0, 1)))));
    if (u > tf + 0.3) { c.state = 'ground'; m.scale.setScalar(1); m.position.copy(c.ground); m.quaternion.copy(c.restQ); return false; }
    return true;
  }
  if (c.state === 'held') {
    handPoint(c.by, m.position); var k = clamp((t - c.tHeld) / 0.5, 0, 1);
    m.quaternion.copy(c.restQ).slerp(_ID, sstep(k)); return true;
  }
  if (c.state === 'fly') {
    var fu = clamp((t - c.f.t0) / c.f.dur, 0, 1), e = sstep(fu);
    if (t < c.f.t0) return true;
    m.position.lerpVectors(c.f.a, c.slot, e); m.position.y += Math.sin(fu * Math.PI) * c.f.arc;
    m.quaternion.copy(c.f.q).slerp(_ID, eio(fu));
    if (c.f.spin) m.quaternion.multiply(_q.setFromAxisAngle(c.axis, c.f.spin * (1 - eio(fu))));
    if (fu >= 1) { c.state = 'placed'; c.tPlaced = t; if (H.sfx() && !X.quiet) H.sfx().play(c.f.tick ? 'tick' : 'clack', 0, { v: 0.6, pan: clamp(c.slot.x / 14, -0.9, 0.9) }, true); }
    return true;
  }
  if (c.state === 'placed') {
    var pu = t - c.tPlaced, s2 = pu < 0.25 ? 0.12 * Math.exp(-pu * 14) * Math.cos(pu * 30) : 0, rip = X.ripple ? bump(t - X.ripple - c.i * 0.035, 0, 0.32) * 0.45 : 0;
    m.position.copy(c.slot); m.position.y += rip - CS * s2 / 2; m.quaternion.copy(_ID); m.scale.set(1 + s2 * 0.4, 1 - s2, 1 + s2 * 0.4);
    return pu < 0.3 || (X.ripple && t < X.ripple + c.i * 0.035 + 0.35);
  }
  return false;
}
function fly(c, t0, dur, arc, spin, tick) {
  c.state = 'fly'; c.f = { t0: t0, dur: dur, arc: arc, a: c.m.position.clone(), q: c.m.quaternion.clone(), spin: spin || 0, tick: !!tick };
}

// ---------------------------------------------------------------- picking up: Bleep alone, then helpers, then Mondo's magic
function findP(kind, not) { for (var i = 0; i < X.cre.length; i++) { var p = X.cre[i]; if (p.kind === kind && p.pack === 'classic' && (!not || not.indexOf(p) < 0)) return p; } return null; }
function makeJob(p, c, t, sp, from) {
  var side = from.x <= c.ground.x ? -1 : 1, stand = { x: c.ground.x + side * 1.6, z: c.ground.z }, yawS = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  var dGo = clamp(Math.hypot(stand.x - from.x, stand.z - from.z) / 7, 0.35, 1.0) * sp + 0.12;
  var front = { x: c.slot.x, z: ROW_FRONT_Z + 1.9 }, dCarry = clamp(Math.hypot(front.x - stand.x, front.z - stand.z) / 7, 0.35, 1.0) * sp + 0.12;
  var j = { p: p, c: c, sp: sp, stand: stand, yawS: yawS, front: front, tGo: t };
  j.tReach = t + dGo; j.tLift = j.tReach + 0.32 * sp; j.tCarry = j.tLift + 0.26 * sp; j.tToss = j.tCarry + dCarry; j.tEnd = j.tToss + 0.42 * sp;
  from.x = front.x; from.z = front.z;
  return j;
}
function planPicking(t0) {
  var cubes = X.msg.cubes, robot = findP('robot') || X.cre[0], wizard = findP('wizard', [robot]) || X.cre[X.cre.length - 1], used = [robot, wizard], helpers = [];
  ['pip', 'penguin', 'fox', 'octopus', 'owl', 'sloth'].forEach(function (k) { var h = findP(k, used); if (h && helpers.length < 3) { helpers.push(h); used.push(h); } });
  var jobs = [], idx = 0, from = { x: robot.x, z: robot.z }, tt = t0;
  [1, 0.85, 0.72].forEach(function (sp) { if (idx < cubes.length) { var j = makeJob(robot, cubes[idx++], tt, sp, from); jobs.push(j); tt = j.tEnd; } });
  var tH = jobs.length ? jobs[jobs.length - 1].tGo : t0, froms = helpers.map(function (h) { return { x: h.x, z: h.z }; }), tts = helpers.map(function (h, i) { return tH + i * 0.3; });
  for (var round = 0; round < 2; round++) helpers.forEach(function (h, i) { if (idx < cubes.length) { var j = makeJob(h, cubes[idx++], tts[i], 0.62, froms[i]); jobs.push(j); tts[i] = j.tEnd; } });
  var end = t0; jobs.forEach(function (j) { end = Math.max(end, j.tEnd); });
  // the rest: Mondo raises his arms (stars) and the cubes hop onto the riser in reading order, one after another
  var tc = end + 0.5;
  queue(wizard, 'stars', tc - 0.4, 1.5);
  for (var k = idx; k < cubes.length; k++) cubes[k].cascade = tc + (k - idx) * 0.075;
  var last = cubes.length ? (cubes[cubes.length - 1].cascade || end) + 0.75 : end;
  X.jobs = jobs; X.pickers = [robot].concat(helpers);
  return Math.max(end, last);
}
function stepPicking(t) {
  X.pickers.forEach(function (p) {
    var j = null; for (var i = 0; i < X.jobs.length; i++) { var q = X.jobs[i]; if (q.p === p && t >= q.tGo && t < q.tEnd + 0.05) { j = q; break; } }
    if (!j) {
      p.hold = null;
      var later = X.jobs.some(function (q) { return q.p === p && q.tGo > t; });
      if (!later && !p.goneHome && X.jobs.some(function (q) { return q.p === p; })) { p.goneHome = true; moveTo(p, p.flank.x, p.flank.z, t, 1.1, p.flank.yaw, 3, 0.7); }
      return;
    }
    var c = j.c;
    if (!j.go) { j.go = true; moveTo(p, j.stand.x, j.stand.z, j.tGo, j.tReach - j.tGo, j.yawS, Math.max(1, Math.round((j.tReach - j.tGo) / 0.38)), 0.7); }
    if (t < j.tReach) { p.hold = null; return; }
    if (t < j.tLift) { var k = sstep((t - j.tReach) / (j.tLift - j.tReach)); p.hold = { y: lerp(1.0, -0.9, k), z: lerp(1.5, 2.1, k), k: k, lean: 0.3 * k }; return; }
    if (c.state === 'ground') { c.state = 'held'; c.by = p; c.tHeld = t; if (H.sfx() && !X.quiet) H.sfx().play('pat', 0, { pan: clamp(p.x / 14, -0.9, 0.9) }, true); }
    if (t < j.tCarry) { var k2 = sstep((t - j.tLift) / (j.tCarry - j.tLift)); p.hold = { y: lerp(-0.9, 1.2, k2), z: lerp(2.1, 1.5, k2), k: 1, lean: 0.3 * (1 - k2) }; return; }
    if (!j.carry) { j.carry = true; moveTo(p, j.front.x, j.front.z, j.tCarry, j.tToss - j.tCarry, Math.PI, Math.max(1, Math.round((j.tToss - j.tCarry) / 0.38)), 0.55); }
    if (t < j.tToss) { p.hold = { y: 1.2, z: 1.5, k: 1 }; return; }
    var k3 = sstep((t - j.tToss) / (j.tEnd - j.tToss));
    p.hold = { y: lerp(1.2, 2.5, k3), z: lerp(1.5, 1.9, k3), k: 1 - sstep((k3 - 0.5) / 0.5) };
    if (c.state === 'held' && t >= j.tToss + 0.08) fly(c, t, 0.42 * j.sp + 0.08, 1.1, 0, false);
  });
  X.msg.cubes.forEach(function (c) { if (c.cascade && c.state === 'ground' && t >= c.cascade) fly(c, c.cascade, 0.72, 2.8, TAU, true); });
}

// ---------------------------------------------------------------- fireworks over the far stand (night; never with Reduce flashing)
function fireworks(t0) {
  var shells = 5, per = H.qLevel() === 0 ? 70 : 120, N = shells * per, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  var m = new THREE.PointsMaterial({ size: 0.9, map: X.sh.g.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  var pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4; X.scene.add(pts); X.own.geo.push(g); X.own.mat.push(m);
  var PAL = [[1, 0.35, 0.4], [1, 0.82, 0.25], [0.35, 0.7, 1], [0.45, 0.95, 0.4], [0.8, 0.55, 1]], P = [];
  for (var s = 0; s < shells; s++) {
    var cx = [-11, 9, -3, 13, 2][s], cy = H.FY + rnd(21, 26), cz = rnd(-16, -10), ts = t0 + [0, 0.7, 1.3, 1.9, 2.6][s], c = PAL[s % PAL.length];
    for (var i = 0; i < per; i++) {
      var th = rnd(0, TAU), ph = Math.acos(rnd(-1, 1)), sp = rnd(5.5, 7.5);
      P.push({ x: cx, y: cy, z: cz, vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp, vz: Math.sin(ph) * Math.sin(th) * sp, t0: ts, life: rnd(1.5, 2.2), c: c });
    }
  }
  X.fw = { pts: pts, P: P, pos: pos, col: col, end: t0 + 2.6 + 2.4 };
  if (typeof FxSfx !== 'undefined') try { [0, 0.7, 1.3, 1.9, 2.6].forEach(function (d, i) { FxSfx.boom({ delay: d, size: 0.35 + 0.1 * (i % 3), pan: [-0.6, 0.5, -0.15, 0.7, 0.1][i] }); }); } catch (e) {}
}
function stepFireworks(dt) {
  var f = X.fw; if (!f) return false;
  var t = X.t, live = 0;
  f.P.forEach(function (p, i) {
    var u = t - p.t0, k = u / p.life, o = i * 3;
    if (u < 0 || k >= 1) { f.pos[o + 1] = -999; return; }
    live++; var drag = Math.exp(-u * 1.6), x = p.x + p.vx * (1 - drag) / 1.6, z = p.z + p.vz * (1 - drag) / 1.6, y = p.y + p.vy * (1 - drag) / 1.6 - 2.2 * u * u;
    f.pos[o] = x; f.pos[o + 1] = y; f.pos[o + 2] = z;
    var b = (1 - k) * (1 - k) * (u < 0.12 ? u / 0.12 : 1); f.col[o] = p.c[0] * b; f.col[o + 1] = p.c[1] * b; f.col[o + 2] = p.c[2] * b;
  });
  f.pts.geometry.attributes.position.needsUpdate = true; f.pts.geometry.attributes.color.needsUpdate = true;
  if (t > f.end) { f.pts.visible = false; X.fw = null; return true; }
  return true;
}

// ---------------------------------------------------------------- the camera: fitted framings, eased between
function fitView(pts, pitchDeg, look, W, H0, padTop, padBot, yawDeg) {
  var cam = X.camera, p = pitchDeg * Math.PI / 180, y = (yawDeg || 0) * Math.PI / 180, d = new THREE.Vector3(Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)), q = new THREE.Vector3();
  cam.aspect = W / H0; cam.clearViewOffset(); cam.updateProjectionMatrix();
  var aw = W * 0.92, ah = H0 * (1 - padTop - padBot) * 0.96;
  function box(dist) {
    cam.position.copy(look).addScaledVector(d, dist); cam.lookAt(look); cam.updateMatrixWorld();
    var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
    pts.forEach(function (v) { q.copy(v).project(cam); var px = (q.x + 1) / 2 * W, py = (1 - q.y) / 2 * H0; b.x0 = Math.min(b.x0, px); b.x1 = Math.max(b.x1, px); b.y0 = Math.min(b.y0, py); b.y1 = Math.max(b.y1, py); });
    return b;
  }
  var lo = 5, hi = 300;
  for (var it = 0; it < 28; it++) { var mid = (lo + hi) / 2, bb = box(mid); if (bb.x1 - bb.x0 <= aw && bb.y1 - bb.y0 <= ah) hi = mid; else lo = mid; }
  var b = box(hi), cy = H0 * padTop + H0 * (1 - padTop - padBot) / 2;
  return { pos: cam.position.clone(), look: look.clone(), ox: (b.x0 + b.x1) / 2 - W / 2, oy: (b.y0 + b.y1) / 2 - cy };
}
function setCam(v) {
  var cam = X.camera, W = X.W, H0 = X.H;
  cam.aspect = W / H0; cam.setViewOffset(W, H0, v.ox, v.oy, W, H0); cam.updateProjectionMatrix();
  cam.position.copy(v.pos); cam.lookAt(v.look); cam.updateMatrixWorld();
}
function mixCam(a, b, k) { return { pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k), ox: lerp(a.ox, b.ox, k), oy: lerp(a.oy, b.oy, k) }; }
// the framings: 'show' (Tyson from behind, the singers and the riser in front of him), 'tata' (closer, on the heart),
// 'final' (the message, Tyson, Tata and the creatures beside it)
function framings() {
  var FY = H.FY, W = X.W, H0 = X.H, portrait = W / H0 < 0.9, P = [], msgW = X.msg.W / 2;
  function v(x, y, z) { P.push(new THREE.Vector3(x, y, z)); }
  v(-9, FY, KZ - 5); v(9, FY, KZ - 5); v(0, FY + 5.6, KZ - 9.1); v(-6, FY + 5.6, KZ - 8.1); v(6, FY + 5.6, KZ - 8.1); v(0, FY, KZ + 0.8); v(0, FY + 5.3, KZ);
  if (!portrait) { v(-8.5, FY + 4.8, KZ - 3.6); v(8.5, FY + 4.8, KZ - 3.6); }
  var show = fitView(P, -27, new THREE.Vector3(0, FY + 2.4, KZ - 5.2), W, H0, 0.15, 0.1);
  var tl = new THREE.Vector3(TATA_SPOT.x + 0.8, FY + 3.0, TATA_SPOT.z + 1.5);
  var tata = fitView([new THREE.Vector3(TATA_SPOT.x - 2.2, FY, TATA_SPOT.z), new THREE.Vector3(TATA_SPOT.x + 1.5, FY + 7.2, TATA_SPOT.z), new THREE.Vector3(1.4, FY, KZ), new THREE.Vector3(-1.4, FY + 5.2, KZ)], -13, tl, W, H0, 0.16, 0.1, -18);
  P = []; var top = H.FY + (X.msg.R + 1) * CS, backZ = ROW_FRONT_Z - (X.msg.R - 1) * ROW_DZ;
  v(-msgW, FY + CS, ROW_FRONT_Z + 0.6); v(msgW, FY + CS, ROW_FRONT_Z + 0.6); v(-msgW, top + 0.3, backZ); v(msgW, top + 0.3, backZ); v(0, FY, KZ + 1.6); v(0, FY + 5.4, KZ);
  if (!portrait) { v(-12.5, FY + 4.5, KZ - 4); v(12.5, FY + 4.5, KZ - 4); }
  var fin = fitView(P, -30, new THREE.Vector3(0, FY + 2.2, (backZ + KZ) / 2), W, H0, 0.13, portrait ? 0.2 : 0.16);
  // the cube rain and the picking: higher, the riser, the scatter in front of Tyson and both groups of creatures
  P = []; v(-msgW, top + 0.3, backZ); v(msgW, top + 0.3, backZ); v(-10, FY, KZ - 2); v(10, FY, KZ - 2); v(0, FY, KZ + 1.6);
  if (!portrait) { v(-14.5, FY + 4.4, 8); v(14.5, FY + 4.4, 8); }
  var cubes = fitView(P, -38, new THREE.Vector3(0, FY + 1.0, 6.5), W, H0, 0.12, 0.1);
  return { show: show, tata: tata, cubes: cubes, final: fin };
}

// ---------------------------------------------------------------- the overlay: captions, "Tap to skip", the final buttons
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function overlay() {
  var el = document.createElement('div'); el.id = 'bdayLayer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Birthday surprise');
  el.innerHTML = '<div class="bd-cap" aria-live="polite"></div><div class="bd-bar"><button class="bd-chip" type="button">Tap to skip</button></div>';
  el.addEventListener('pointerdown', function (e) { e.stopPropagation(); }, true);
  el.addEventListener('click', function (e) {
    e.stopPropagation(); e.preventDefault();
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && b.getAttribute('data-bd') === 'photo') { photo(); return; }
    if (b && b.getAttribute('data-bd') === 'done') { end(); return; }
    if (X && X.final) { if (X.final === 'ready') end(); return; }
    toFinal();
  });
  document.body.appendChild(el); document.body.classList.add('bday-on');
  return el;
}
function caption(html) {
  var c = X && X.el && X.el.querySelector('.bd-cap'); if (!c) return;
  if (!html) { c.classList.remove('on'); return; }
  c.innerHTML = html; c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
}
function finalButtons() {
  var bar = X.el.querySelector('.bd-bar');
  bar.innerHTML = '<button class="bd-btn photo bd-fade" type="button" data-bd="photo">Take a photo</button><button class="bd-btn done bd-fade" type="button" data-bd="done">Done</button>';
  X.final = 'ready';
}
function photo() {
  try { render(); var cv = photoCanvas(H.renderer.domElement); if (cv) savePhoto(cv); if (typeof Snd !== 'undefined' && Snd.click) Snd.click(); } catch (e) { console.warn('birthday photo', e); }
}

// ---------------------------------------------------------------- play
export function play(hooks) {
  if (X) return false;
  H = hooks; loadCss();
  var B = H.B; if (!B || !H.take(function () { end(true); })) return false;
  var r = H.renderer, info = r.info.memory;
  X = { t: 0, last: 0, raf: 0, ev: [], scene: B.scene, camera: B.camera, own: { tex: [], geo: [], mat: [] }, cre: [], quiet: false, final: null, waiting: true,
    mem0: { geometries: info.geometries, textures: info.textures }, T: { fin: Infinity }, msgTxt: message(), mood: null, mode: H.mode, renders: 0 };
  X.el = overlay();
  X.W = H.host.clientWidth || innerWidth; X.H = H.host.clientHeight || innerHeight;
  try { if (typeof Snd !== 'undefined') { X.mood = Snd.getMood ? Snd.getMood() : null; Snd.setMood('off'); } } catch (e) {}
  try { if (H.sfx()) H.sfx().ambience(false); } catch (e) {}
  X.hidden = B.cubes.filter(function (c) { return c.d.loose && c.m.visible; }); X.hidden.forEach(function (c) { c.m.visible = false; });
  X.sh = shared(); [X.sh.g.drum, X.sh.g.cap, X.sh.g.rim, X.sh.g.step].forEach(function (g) { X.own.geo.push(g); }); [X.sh.g.dot, X.sh.g.star, X.sh.g.heart].forEach(function (t) { X.own.tex.push(t); });
  X.own.mat = X.own.mat.concat(X.sh.m.drums, [X.sh.m.cap, X.sh.m.rim, X.sh.m.riser, X.sh.m.trim]);
  X.spr = sprites(); X.spr.forEach(function (s) { X.own.mat.push(s.material); });
  var narrow = X.W / X.H < 0.9;
  X.msg = buildMessage(rowsFor(X.msgTxt.lines, narrow ? 14 : 22)); scatter(X.msg.cubes);
  X.kid = makeHuman('kid'); X.tata = makeHuman('tata');
  var c = B.camera; X.vTitle = { pos: c.position.clone(), look: new THREE.Vector3(0, H.FY + 4.6, H.STAGE.z + 1.5), ox: c.view && c.view.enabled ? c.view.offsetX : 0, oy: c.view && c.view.enabled ? c.view.offsetY : 0 };
  X.views = framings();
  if (X.kid) { var k0 = B.kid; X.kid.x = k0.x; X.kid.z = k0.z; X.kid.yaw = 0.16; X.kid.model.root.visible = true; X.kid.rest = 'hips'; walkTo(X.kid, 0, KZ, 0.4, 3.0, Math.PI, true); }
  if (X.tata) { X.tata.x = 21; X.tata.z = 6; X.tata.yaw = -Math.PI / 2; }
  timeline();
  readyMonsters(castList(H.qLevel()), 1800).then(function (list) { if (!X) return; buildCast(list); X.waiting = false; }, function () { if (X) { buildCast(castList(0)); X.waiting = false; } });
  window.addEventListener('resize', onResize); document.addEventListener('visibilitychange', onResize);
  X.last = performance.now(); X.raf = requestAnimationFrame(frame);
  return true;
}
function onResize() { if (X) { X.resized = true; kick(); } }

// ---------------------------------------------------------------- the cast: two curved rows round Tyson, then the flanks
function buildCast(list) {
  var n = list.length, nf = Math.ceil(n / 2), nb = n - nf, front = [], back = [], deg = Math.PI / 180;
  for (var i = 0; i <= nf; i++) front.push(lerp(-64, 64, i / nf) * deg);
  var tataA = front.splice(Math.floor(front.length / 2), 1)[0];
  for (var j = 0; j < nb; j++) back.push(lerp(-55, 55, nb > 1 ? j / (nb - 1) : 0.5) * deg);
  // who stands where: Pip in the middle of the front row, the others alternating out from the middle
  var order = list.slice().sort(function (a, b) { return (a.kind === 'pip' ? -1 : 0) - (b.kind === 'pip' ? -1 : 0); });
  var fo = front.map(function (a, k) { return k; }).sort(function (a, b) { return Math.abs(front[a]) - Math.abs(front[b]); });
  var bo = back.map(function (a, k) { return k; }).sort(function (a, b) { return Math.abs(back[a]) - Math.abs(back[b]); });
  var flank = [], fl = [[10.8, 7.4], [13.6, 6.6], [10.8, 9.0], [13.6, 8.2], [10.8, 10.6], [13.6, 9.8], [10.8, 12.2], [13.6, 11.4]];
  order.forEach(function (c, k) {
    var isBack = k >= nf, ang = isBack ? back[bo[k - nf]] : front[fo[k]], R = isBack ? 9.1 : 6.0;
    var p = makeCreature(c, k, isBack), x = Math.sin(ang) * R, z = KZ - Math.cos(ang) * R;
    p.slot = { x: x, z: z, yaw: Math.atan2(-x, KZ - z) }; p.ph = k * 0.37;
    var side = x < 0 ? -1 : 1; p.side = side; X.cre.push(p);
  });
  // flanks: fill each side from the inside front outwards
  [-1, 1].forEach(function (side) {
    var mine = X.cre.filter(function (p) { return p.side === side; }).sort(function (a, b) { return Math.abs(a.slot.x) - Math.abs(b.slot.x); });
    mine.forEach(function (p, k) { var f = fl[Math.min(k, fl.length - 1)], x = side * f[0], z = f[1] + (k >= fl.length ? 1.2 : 0); p.flank = { x: x, z: z, yaw: Math.atan2(-x * 0.6, (KZ - 4) - z) }; });
  });
  if (X.tata) X.tata.slot = { x: Math.sin(tataA) * 6.0, z: KZ - Math.cos(tataA) * 6.0 };
  // the parade: two lines hop in from the sides of the pitch
  var tp = 2.6;
  [-1, 1].forEach(function (side) {
    var mine = X.cre.filter(function (p) { return p.side === side; }).sort(function (a, b) { return Math.abs(a.slot.x) - Math.abs(b.slot.x); });
    mine.forEach(function (p, k) {
      var t0 = tp + k * 0.42 + (side > 0 ? 0.2 : 0); p.x = side * 21; p.z = 5.2 + (k % 2) * 1.4; p.yaw = -side * Math.PI / 2;
      p.enter = t0; moveTo(p, p.slot.x, p.slot.z, t0, 3.0, p.slot.yaw, 7, 0.85);
    });
  });
  try { if (H.renderer.compile) H.renderer.compile(X.scene, X.camera); } catch (e) {}
  X.stats = { creatures: X.cre.length, monsters: X.cre.filter(function (p) { return p.pack === 'monsters'; }).length };
}

// ---------------------------------------------------------------- the score: what happens when (seconds into the show)
function at(t, fn) { X.ev.push({ t: t, fn: fn }); }
function timeline() {
  var plan = songPlan(0.56), S0 = 10.2, SE = S0 + plan.total, nm = X.msgTxt.name;
  X.plan = plan; X.T.song = S0; X.T.songEnd = SE;
  at(0.15, function () { var s = H.sfx(); if (s) { s.begin(); s.play('sparkle', 0.05); s.play('chime', 0.3); } });
  at(2.7, function () { X.cre.forEach(function (p) { at(p.enter, function () { if (H.sfx()) H.sfx().play('boing', 0, { pan: clamp(p.x / 21, -0.9, 0.9) }, true); }); }); });
  at(4.2, function () { if (X.tata) { X.tata.model.root.visible = true; X.tata.rest = 'hang'; walkTo(X.tata, X.tata.slot.x, X.tata.slot.z, 4.2, 3.2, 0, true); } });
  at(9.6, function () { loadSfx(); try { H.B.venue.crowd('clap'); } catch (e) {} });
  at(S0 - 0.15, function () {
    loadSfx().then(function (sfx) {
      if (!X) return;
      X.song = { t0: X.t + 0.15, plan: plan };
      if (sfx && !X.final) { var h = sfx.song(plan, 0.15); X.songH = h; if (h && h.t0 != null) X.song.audio = h.t0; }
    });
    if (X.tata) hq(X.tata, 'dance', S0, plan.total + 0.2);
  });
  var lines = ['Happy birthday to you', 'Happy birthday to you', 'Happy birthday, dear <span class="nm">' + esc(nm) + '</span>', 'Happy birthday to you!'];
  LINE_AT.forEach(function (ni, l) { at(S0 + plan.notes[ni].t - 0.25, function () { caption(lines[l]); }); });
  if (X.kid) { hq(X.kid, 'look', S0 + 3, 2.4); X.kid.moves[X.kid.moves.length - 1].st.dir = 0.35; hq(X.kid, 'look', S0 + 8.5, 2.4); X.kid.moves[X.kid.moves.length - 1].st.dir = -0.35; }
  at(SE + 0.2, function () {
    caption('Hooray!'); try { H.B.venue.crowd('cheer', { wave: true }); } catch (e) {}
    var s = H.sfx(); if (s) s.play('crowd', 0, {}, true); if (window.BirthdaySfx) BirthdaySfx.pop('hooray');
    X.cre.forEach(function (p, i) { queue(p, 'cheer', SE + 0.25 + (i % 4) * 0.05, 1.1); });
    if (X.kid) hq(X.kid, 'clap', SE + 0.3, 1.6);
  });
  var SM = SE + 1.6;
  at(SM, function () { X.cre.forEach(function (p, i) { sillyFor(p).forEach(function (mv, k) { queue(p, mv, SM + k * 1.45 + (i % 5) * 0.09, 1.3); }); }); caption(''); });
  if (X.tata) {
    at(SM + 0.3, function () { walkTo(X.tata, TATA_SPOT.x, TATA_SPOT.z, SM + 0.3, 1.2, 0.22, false); });   // turned a little toward us, so the heart reads past Tyson
    at(SM + 1.6, function () { hq(X.tata, 'heart', SM + 1.6, 4.2); });
    if (X.kid) hq(X.kid, 'clap', SM + 3.2, 1.4);
  }
  var TF = SM + 6.2; X.T.heart0 = SM + 1.5; X.T.heart1 = SM + 5.6; X.T.flank = TF;
  at(TF, function () {
    X.cre.forEach(function (p, i) { moveTo(p, p.flank.x, p.flank.z, TF + i * 0.05, 1.5, p.flank.yaw, 4, 0.8); });
    if (X.tata) { X.tata.rest = 'hang'; walkTo(X.tata, 2.6, KZ + 1.3, TF + 0.2, 2.0, Math.PI, false); }
  });
  var TR = TF + 1.6; X.T.riser = TR;
  at(TR, function () { X.msg.riser.visible = true; X.riserT = TR; var s = H.sfx(); if (s) s.play('whoosh', 0, {}, true); });
  var TD = TR + 0.9; X.T.drop = TD;
  at(TD, function () {
    var cs = X.msg.cubes.slice().sort(function () { return Math.random() - 0.5; });
    cs.forEach(function (c, i) { c.state = 'fall'; c.t0 = TD + i * (2.4 / cs.length); c.h = rnd(15, 22); });
    var s = H.sfx(); if (s) s.play('liftoff', 0, {}, true);
  });
  at(TD + 3.8, function () {
    var end = planPicking(TD + 4.0), tf = end + 0.4; X.T.fin = tf;
    at(tf, function () { X.ripple = tf; caption('Happy birthday, <span class="nm">' + esc(nm) + '</span>!'); if (window.BirthdaySfx) BirthdaySfx.pop('sparkle'); var s = H.sfx(); if (s) s.play('sparkle', 0, {}, true); });
    at(tf + 1.4, finale);
    at(tf + 5.6, function () { if (!X.final) finalButtons(); });
  });
}
function finale() {
  var t = X.t;
  if (!calm()) fireworks(t + 0.2);
  try { H.startConfetti(); } catch (e) {}
  try { H.B.venue.crowd('cheer', { wave: true }); } catch (e) {}
  var s = H.sfx(); if (s) { s.play('crowd', 0, {}, true); s.play('confetti', 0.05, {}, true); }
  X.cre.forEach(function (p, i) { queue(p, i % 3 === 1 ? 'hop' : 'cheer', t + 0.1 + (i % 6) * 0.08, 1.2); });
  if (X.kid) hq(X.kid, 'cheer', t + 0.15, 1.8);
  if (X.tata) hq(X.tata, 'wave', t + 0.5, 2.2);
}

// ---------------------------------------------------------------- the loop
function camAt(t) {
  var V = X.views, T = X.T;
  if (X.final) return V.final;
  if (t < 3.2) return mixCam(X.vTitle, V.show, eio(t / 3.2));
  if (t >= T.fin + 1.4) return mixCam(V.cubes, V.final, eio((t - T.fin - 1.4) / 3.2));
  var base = V.show;
  if (t >= T.heart0 && t < T.heart1 + 1.4) { var k = t < T.heart1 ? eio((t - T.heart0) / 1.2) : 1 - eio((t - T.heart1) / 1.4); base = mixCam(V.show, V.tata, k); }
  if (t >= T.flank) return mixCam(base, V.cubes, eio((t - T.flank) / 2.4));
  return base;
}
function kick() { if (X && !X.raf) { X.last = performance.now(); X.raf = requestAnimationFrame(frame); } }
function render() { var r = H.renderer; r.setRenderTarget(null); r.render(X.scene, X.camera); X.renders++; }
function frame(now) {
  if (!X) return; X.raf = 0;
  now = now || performance.now();
  var dt = Math.min(0.05, Math.max(0, (now - X.last) / 1000)); X.last = now;
  if (X.resized) { X.resized = false; X.W = H.host.clientWidth || innerWidth; X.H = H.host.clientHeight || innerHeight; H.renderer.setSize(X.W, X.H, false); X.views = framings(); }
  if (X.waiting && X.t >= 2.3) dt = 0;                          // the creatures are still being made: hold the clock
  X.t += dt; var t = X.t, busy = !X.final || X.t < (X.settleUntil || 0);
  // keep the creatures' singing on the music's own clock
  if (X.song && X.song.audio != null && typeof Snd !== 'undefined' && Snd.context) { var ac = Snd.context(); if (ac && ac.state === 'running') X.song.t0 = t - (ac.currentTime - X.song.audio); }
  X.ev.sort(function (a, b) { return a.t - b.t; });
  while (X.ev.length && X.ev[0].t <= t) { var e = X.ev.shift(); try { e.fn(); } catch (err) { console.warn('birthday', err); } if (!X) return; }
  if (X.riserT != null) { var rk = clamp((t - X.riserT) / 1.0, 0, 1); X.msg.riser.position.y = -(1 - eout(rk)) * ((X.msg.R + 1) * CS + 0.2); }
  if (X.pickers) stepPicking(t);
  X.cre.forEach(function (p) { if (!p.g.visible && p.enter != null && t >= p.enter) p.g.visible = true; if (p.g.visible) stepCreature(p, t, now); });
  if (X.kid) stepHuman(X.kid, t);
  if (X.tata && X.tata.model.root.visible) stepHuman(X.tata, t);
  var cb = false; X.msg.cubes.forEach(function (c) { if (c.state && stepCube(c, t)) cb = true; });
  if (stepSprites(dt)) busy = true; if (stepHeart()) busy = true; if (stepFireworks(dt)) busy = true; if (cb) busy = true;
  try { if (H.stepConfetti(now, dt)) busy = true; } catch (e) {}
  try { if (H.B.venue && H.B.venue.step(now)) busy = true; } catch (e) {}
  setCam(camAt(t));
  if (!X.noRender) render();
  if (busy) X.raf = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- skip to the end picture, and the end
function toFinal() {
  if (!X || X.final) return;
  X.final = 'still'; X.quiet = true; X.waiting = false; X.ev = [];
  if (X.songH && X.songH.stop) X.songH.stop(); else if (window.BirthdaySfx) BirthdaySfx.stopAll();
  try { var s = H.sfx(); if (s) s.cancel(); } catch (e) {}
  if (!X.cre.length) buildCast(castList(0).filter(function (c) { return c.pack === 'classic'; }));
  X.song = null; X.pickers = null; X.ripple = null; X.heart = null; X.bigHeart = null;
  X.cre.forEach(function (p) { p.mv = null; p.moves = []; p.hold = null; p.x = p.flank.x; p.z = p.flank.z; p.yaw = p.flank.yaw; p.g.visible = true; });
  if (X.kid) { X.kid.mv = null; X.kid.moves = []; X.kid.x = 0; X.kid.z = KZ; X.kid.yaw = Math.PI; X.kid.rest = 'hips'; }
  if (X.tata) { X.tata.mv = null; X.tata.moves = []; X.tata.x = 2.6; X.tata.z = KZ + 1.3; X.tata.yaw = Math.PI; X.tata.rest = 'hang'; X.tata.model.root.visible = true; }
  X.msg.riser.visible = true; X.riserT = -10;
  X.msg.cubes.forEach(function (c) { c.state = 'placed'; c.tPlaced = -10; c.m.visible = true; });
  X.spr.forEach(function (s) { s.visible = false; });
  if (X.fw) { X.fw.pts.visible = false; X.fw = null; }
  caption('Happy birthday, <span class="nm">' + esc(X.msgTxt.name) + '</span>!');
  finalButtons(); X.final = 'ready';
  X.settleUntil = X.t + 0.1; kick();
}
export function end(aborted) {
  if (!X) return;
  var x = X;
  if (x.raf) cancelAnimationFrame(x.raf); x.raf = 0;
  window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onResize);
  if (x.songH && x.songH.stop) x.songH.stop(); else if (window.BirthdaySfx) BirthdaySfx.stopAll();
  try { var s = H.sfx(); if (s) s.cancel(); } catch (e) {}
  try { if (typeof Snd !== 'undefined' && Snd.stopBabble) Snd.stopBabble(); } catch (e) {}
  freeAll(x);
  if (x.el && x.el.parentNode) x.el.parentNode.removeChild(x.el); document.body.classList.remove('bday-on');
  x.hidden.forEach(function (c) { c.m.visible = true; });
  X = null;
  H.give();
  try { if (typeof Snd !== 'undefined' && x.mood && x.mood !== 'off') Snd.setMood(x.mood); } catch (e) {}
  try { if (!aborted && H.sfx() && x.mode === 'title') H.sfx().ambience(true); } catch (e) {}
  var m = H.renderer.info.memory; lastStats = { geometries: m.geometries - x.mem0.geometries, textures: m.textures - x.mem0.textures, renders: x.renders, creatures: x.stats ? x.stats.creatures : 0, monsters: x.stats ? x.stats.monsters : 0, seconds: +x.t.toFixed(1) };
}
var lastStats = null;
// everything this show made: creatures (a glTF monster shares its geometry with the pack: only its materials are ours),
// the two people, the cubes, the riser, sprites, fireworks; the shared bits last
function freeAll(x) {
  var geos = new Set(x.own.geo), mats = new Set(x.own.mat), texs = new Set(x.own.tex);
  function take(root, own) {
    root.traverse(function (o) {
      if (o.skeleton && own) o.skeleton.dispose();
      if (own && o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) geos.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); if (own) ['map', 'emissiveMap', 'normalMap', 'alphaMap', 'roughnessMap'].forEach(function (k) { if (m[k] && m[k].isTexture) texs.add(m[k]); }); });
    });
  }
  x.cre.forEach(function (p) { if (p.g.parent) p.g.parent.remove(p.g); take(p.actor.root, p.pack !== 'monsters'); [p.g.children[0], p.g.children[1]].forEach(function (o) { if (o && o.material) mats.add(o.material); }); try { if (p.actor.dispose) p.actor.dispose(); } catch (e) {} });
  [x.kid, x.tata].forEach(function (hm) { if (!hm) return; if (hm.model.root.parent) hm.model.root.parent.remove(hm.model.root); take(hm.model.root, true); });
  x.msg.cubes.forEach(function (c) { if (c.m.parent) c.m.parent.remove(c.m); geos.add(c.m.geometry); });
  if (x.msg.riser.parent) x.msg.riser.parent.remove(x.msg.riser);
  x.spr.forEach(function (s) { if (s.parent) s.parent.remove(s); });
  if (x.fw && x.fw.pts.parent) x.fw.pts.parent.remove(x.fw.pts);
  x.scene.children.slice().forEach(function (o) { if (o.isPoints && o.geometry && geos.has(o.geometry)) x.scene.remove(o); });
  var env = x.scene.environment; texs.delete(env);
  geos.forEach(function (g) { try { g.dispose(); } catch (e) {} }); mats.forEach(function (m) { try { m.dispose(); } catch (e) {} }); texs.forEach(function (t) { try { t.dispose(); } catch (e) {} });
}
export function stats() { return X ? { t: +X.t.toFixed(2), final: X.final, renders: X.renders, creatures: X.cre.length, cubes: X.msg.cubes.length, waiting: X.waiting } : { last: lastStats }; }
// checks: jump the show clock to t seconds (events up to t fire in order)
export function _seek(t) { if (!X) return false; X.waiting = false; X.noRender = true; while (X.t < t) { if (X.raf) cancelAnimationFrame(X.raf); X.raf = 0; X.last = performance.now() - 50; frame(performance.now()); if (!X) return false; } X.noRender = false; render(); return true; }
window.TataBirthdayShow = { stats: stats, end: function () { end(); }, skip: function () { toFinal(); }, seek: _seek, _x: function () { return X; } };
