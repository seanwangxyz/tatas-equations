// One-shot gestures for the creature opponents: reactions (moods), dances, entrances/exits and idle flairs.
//
// Every gesture is a pure function of time that ADDS to the pose struct P and asks for arm targets through C.arm();
// nothing here keeps state, allocates, or loops: it plays once and the creature returns to rest.
// The runtime (../creatures.js) fills the context C each frame:
//   C.P (pose), C.u (seconds since start), C.un (u / the creature's tempo), C.e (in/out envelope 0..1),
//   C.sty (personality), C.kind, C.v (variant), C.side (+1/-1: the side it arrives from), C.out (world distance
//   that is safely off screen), C.arm(i,x,y,z,w,align,open), C.fx(n,h) (star burst), C.once(bit,cond), C.rest[i].
// Arm targets are in the creature's own space (x sideways, y up, z toward the player), pre-rotated by P.turn,
// so set P.turn BEFORE calling C.arm. Shoulders sit at (+-1, 1.42); a hand at rest is at (+-1.75, 0.2, 1.45).
import { clamp, lerp, sstep, easeBack } from './common.js';

const TAU = Math.PI * 2;
const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));                 // 0 .. 1 .. 0 over x = 0..1
const pulse = (x, a, b, f) => sstep((x - a) / f) * (1 - sstep((x - b) / f));         // 0 -> 1 at a, 1 -> 0 at b
const ys = (i) => i * 2 - 1;                                                          // arm 0 = -1 (left of screen), arm 1 = +1

function waveR(C, w, u) { if (w > 0) C.arm(1, 1.55 + Math.sin(u * 9) * 0.32, 3.15 + Math.cos(u * 9) * 0.05, 1.0, w, 0.2, 1); }

// ---------- reactions ----------
const MOOD = {
  think: { dur: 2.8, fn(C) {
    const P = C.P, e = C.e;
    P.headRoll += 0.17 * e; P.browAsym += 0.8 * e; P.browTilt -= 0.1 * e; P.smile -= 0.15 * e; P.lean += 0.04 * e; P.lid -= 0.05 * e; P.gazeThink = e;
    C.arm(1, 0.42, 1.78, 1.25, e, 0.35, 0.3);
  } },
  happy: { dur: 2.1, fn(C) {
    const P = C.P, e = C.e, u = C.u;
    P.browRaise += 0.55 * e; P.lid -= 0.3 * e; P.smile += e; P.open += 0.85 * e; P.shrug += 0.3 * e; P.headRoll += 0.05 * Math.sin(u * 3) * e;
    P.hop += 0.16 * Math.sin(Math.PI * clamp(u / 0.5, 0, 1)); P.lean += 0.04 * e; P.happyAmt = Math.max(P.happyAmt, e); P.earUp += 0.6 * e; P.gazeCam = 1;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.95, 3.55, 0.7, e, 0.2, 1);
  } },
  sad: { dur: 2.6, fn(C) {
    const P = C.P, e = C.e, u = C.u, win = 1 - sstep((u - 1.2) / 0.4);
    P.browTilt -= e; P.browRaise += 0.15 * e; P.smile -= 0.9 * e; P.lid -= 0.12 * e; P.lean += 0.17 * e; P.shrug -= 0.5 * e;
    P.headYaw += 0.2 * Math.sin(u * 5.2) * e * win; P.sadAmt = Math.max(P.sadAmt, e); P.breathAmp += 2.2 * e * win; P.gazeSad = e * 0.9;
    for (let i = 0; i < 2; i++) { const r = C.rest[i]; C.arm(i, r.x - ys(i) * 0.28, r.y - 0.3, r.z - 0.55, e, 0.55, 0.3); }
  } },
  challenge: { dur: 1.9, fn(C) {
    const P = C.P, e = C.e, u = C.u;
    P.browTilt += e; P.browRaise -= 0.1 * e; P.open += 0.9 * e; P.smile += 0.1 * e; P.lean += 0.14 * e; P.lid += 0.05 * e;
    P.hop += 0.1 * Math.sin(Math.PI * clamp(u / 0.35, 0, 1)); P.earUp += 0.8 * e; P.gazeCam = 1;
    C.arm(1, 1.35, 3.3, 1.75, e, 0.2, 1);
  } },
  cry: { dur: 2.5, fn(C) {
    const P = C.P, e = C.e, u = C.u, un = C.un;
    const sn = Math.max(0, Math.sin((un - 1.1) * 9)) * (un > 1.1 && un < 1.45 ? 1 : 0) + Math.max(0, Math.sin((un - 1.6) * 9)) * (un > 1.6 && un < 1.95 ? 1 : 0);
    P.browTilt -= 1.1 * e; P.browRaise += 0.2 * e; P.smile += -0.9 * e + 0.15 * Math.sin(u * 18) * e; P.lid -= 0.25 * e; P.lean += 0.17 * e;
    P.shrug += 0.5 * sn * e - 0.3 * e; P.headYaw += 0.12 * Math.sin(u * 3.4) * e; P.cry = e; P.cryT = u; P.sadAmt = Math.max(P.sadAmt, e * 0.6);
    for (let i = 0; i < 2; i++) { const r = C.rest[i]; C.arm(i, r.x - ys(i) * 0.28, r.y - 0.3, r.z - 0.55, e, 0.55, 0.3); }
    // a quick dab at the outer corner of the eye, from the side of the cheek, so the face stays readable
    const ww = pulse(un, 1.0, 1.5, 0.16) * e;
    if (ww > 0) C.arm(1, 1.3 + Math.sin(u * 14) * 0.05, 1.95 + 0.3 * (0.5 + 0.5 * Math.sin(u * 12)), 0.95, ww, 0.3, 0.4);
  } },
  tantrum: { dur: 2.5, fn(C) {
    const P = C.P, e = C.e, u = C.u, un = C.un;
    const tw = sstep((un - 0.3) / 0.2) * (1 - sstep((un - 1.9) / 0.3)), tb = un * 13.8;
    P.browTilt += 1.2 * e; P.browRaise -= 0.2 * e; P.open += 0.9 * e; P.smile -= 0.3 * e; P.lean += 0.12 * e; P.lid += 0.05 * e;
    P.headYaw += 0.3 * Math.sin(un * 22) * tw; P.sway += 0.05 * Math.sin(tb) * tw; P.hop += 0.09 * Math.max(0, Math.sin(tb)) * tw;
    P.angry = e; P.steam = e; P.steamT = u; P.gazeCam = 1;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.5, 0.25 + 1.9 * (0.5 + 0.5 * Math.sin(tb + i * Math.PI)), 1.3, tw * e, 0.4, 0);
  } },
  gloat: { dur: 2.0, fn(C) {
    const P = C.P, e = C.e, un = C.un;
    const lw = sstep((un - 0.9) / 0.2) * (1 - sstep((un - 1.7) / 0.2)), lh = Math.abs(Math.sin(un * 10));
    P.lean -= 0.1 * e; P.lid -= 0.28 * e; P.browAsym += 0.9 * e; P.smile += 0.75 * e; P.headRoll += 0.08 * e; P.pitchAdd -= 0.3 * e;
    P.open += (0.15 + 0.5 * lh) * lw * e; P.shrug += 0.35 * lh * lw * e; P.gazeCam = 1;
    const ct = un * 9, w0 = pulse(un, 0.0, 1.1, 0.25) * e;
    C.arm(0, -0.3 + Math.cos(ct) * 0.12, 1.0 + Math.sin(ct) * 0.1, 1.2, w0, 0.3, 0.3);
    C.arm(1, 1.0, 2.3, 2.7, pulse(un, 0.9, 1.9, 0.25) * e, 0.2, 0.1);
  } },

  // ----- new reactions to the player -----
  nod: { dur: 1.5, att: 0.15, rel: 0.45, fn(C) {
    const P = C.P, e = C.e, k = clamp(C.un / 1.2, 0, 1), d = Math.pow(Math.sin(Math.PI * 2 * k), 2);
    P.pitchAdd += 0.3 * d * e; P.smile += 0.55 * e; P.lid -= 0.06 * e + 0.12 * d * e; P.browRaise += 0.2 * e; P.lean += 0.03 * e; P.gazeCam = 1; P.earUp += 0.3 * e;
  } },
  gasp: { dur: 2.0, att: 0.1, rel: 0.5, fn(C) {
    const P = C.P, e = C.e, un = C.un, h = pulse(un, 0.0, 1.35, 0.2);
    P.hop += 0.28 * bump(un / 0.3) * e; P.eyeWide += e; P.lid += 0.2 * e; P.browRaise += 1.0 * e; P.open += 0.8 * e; P.mouthW = 1 - 0.45 * e;
    P.lean -= 0.2 * e; P.pupil -= 0.5 * e; P.earUp += e; P.shrug += 0.35 * e; P.gazeCam = 1;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.55, 2.7, 1.3, h * e, 0.3, 1);
  } },
  nervous: { dur: 2.8, fn(C) {
    const P = C.P, e = C.e, un = C.un, u = C.u, g = pulse(un, 0.3, 2.2, 0.2);
    P.browTilt -= e; P.browRaise += 0.3 * e; P.smile -= 0.35 * e + 0.08 * Math.sin(un * 15) * e; P.lid -= 0.08 * e; P.lean -= 0.05 * e; P.shrug += 0.25 * e;
    const gl = Math.sin(un * TAU * 0.85);
    P.headYaw += 0.38 * gl * g * e; P.eyeAddX += 0.9 * gl * g * e;
    P.sweat = e * sstep((un - 0.5) / 0.2); P.sweatT = u;
    P.gulp = bump((un - 1.55) / 0.3) * e; P.pupil -= 0.3 * e; P.sadAmt = Math.max(P.sadAmt, e * 0.4);
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 0.4 + Math.cos(un * 9 + i * Math.PI) * 0.13, 1.4 + Math.sin(un * 9 + i * Math.PI) * 0.1, 1.5, e, 0.3, 0.3);
  } },
  laugh: { dur: 1.9, att: 0.15, rel: 0.5, fn(C) {
    const P = C.P, e = C.e, un = C.un, s = Math.pow(Math.sin(un * TAU * 1.15), 2);
    P.open += e * (0.5 + 0.45 * s); P.smile += e; P.lid -= 0.5 * e; P.browRaise += 0.3 * e; P.headRoll += 0.05 * Math.sin(un * 7) * e; P.pitchAdd -= 0.22 * e;
    P.shrug += 0.5 * s * e; P.hop += 0.05 * s * e; P.gazeCam = 1; P.happyAmt = Math.max(P.happyAmt, e * 0.8); P.earUp += 0.4 * e;
    C.arm(1, 0.35, 0.95, 1.35, e, 0.4, 0.5); C.arm(0, -1.6, 0.9, 1.2, 0.8 * e, 0.4, 0.5);
  } },
  facepalm: { dur: 2.4, att: 0.2, rel: 0.5, fn(C) {
    const P = C.P, e = C.e, un = C.un;
    P.pitchAdd += 0.32 * e; P.lid -= 0.55 * e; P.browTilt -= 0.6 * e; P.smile -= 0.5 * e; P.lean += 0.06 * e; P.headYaw += 0.12 * Math.sin(un * 2.4) * e; P.sadAmt = Math.max(P.sadAmt, e * 0.5);
    C.arm(1, 0.15, 2.45, 1.55, pulse(un, 0.0, 1.8, 0.35) * e, 0.1, 0.9);
    const r = C.rest[0]; C.arm(0, r.x - 0.28, r.y - 0.3, r.z - 0.55, e, 0.55, 0.3);
  } },
  shrug: { dur: 1.9, att: 0.2, rel: 0.5, fn(C) {
    const P = C.P, e = C.e;
    P.shrug += e; P.headRoll += 0.12 * e; P.browRaise += 0.6 * e; P.browAsym += 0.3 * e; P.smile -= 0.3 * e; P.lid -= 0.1 * e; P.gazeCam = 1;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 2.4, 1.55, 1.0, e, 0.15, 1);
  } },
  wave: { dur: 2.0, att: 0.2, rel: 0.5, fn(C) {
    const P = C.P, e = C.e, u = C.u;
    P.smile += 0.8 * e; P.open += 0.3 * e; P.lid -= 0.1 * e; P.headRoll += 0.06 * Math.sin(C.un * 4) * e; P.browRaise += 0.3 * e; P.gazeCam = 1; P.earUp += 0.3 * e;
    waveR(C, e, u);
  } },
  clap: { dur: 2.4, att: 0.2, rel: 0.5, fn(C) {
    const P = C.P, e = C.e, un = C.un, ph = un * TAU / 0.38, cp = 0.5 + 0.5 * Math.cos(ph);
    P.smile += e; P.lid -= 0.2 * e; P.browRaise += 0.4 * e; P.hop += 0.03 * Math.abs(Math.sin(ph / 2)) * e; P.pitchAdd += 0.05 * Math.sin(ph) * e; P.gazeCam = 1; P.happyAmt = Math.max(P.happyAmt, e * 0.7); P.earUp += 0.5 * e;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * (0.2 + 0.8 * cp), 1.85 + 0.1 * Math.sin(ph), 1.7, e, 0.2, lerp(0.2, 1, cp));
  } },
  sleepy: { dur: 3.6, att: 0.3, rel: 0.6, fn(C) {
    const P = C.P, e = C.e, un = C.un, y = pulse(un, 0.2, 2.5, 0.6), st = pulse(un, 0.3, 2.4, 0.7), dr = pulse(un, 2.7, 3.5, 0.3);
    P.open += 0.9 * y * e; P.lid -= (0.55 * y + 0.4 * dr) * e; P.pitchAdd += (-0.25 * st + 0.1 * dr) * e; P.lean -= 0.12 * st * e; P.shrug += 0.4 * st * e; P.smile -= 0.2 * e;
    P.breathAmp += 1.6 * st * e; P.browRaise += 0.2 * y * e;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.15, 3.7, 0.5, st * e, 0.1, 1);
  } }
};

// ---------- victory dances (soccer goal celebrations); `un` runs 0..3 ----------
function danceSlide(C) {                       // knee slide: fists up, head back, big shout
  const P = C.P, e = C.e, un = C.un, k = sstep((un - 0.25) / 0.35) * (1 - sstep((un - 2.0) / 0.8));
  P.slide += 1.5 * k * e; P.hop -= 0.5 * k * e; P.lean -= 0.4 * k * e; P.pitchAdd -= 0.3 * k * e;
  P.open += 0.9 * e * pulse(un, 0.2, 2.4, 0.2); P.smile += e; P.lid -= 0.35 * e; P.browRaise += 0.5 * e; P.earUp += 0.7 * e; P.gazeCam = 1;
  const up = sstep((un - 0.2) / 0.3) * (1 - sstep((un - 2.7) / 0.3)) * e;
  for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.9, 3.0 + 0.3 * Math.sin(un * 9 + i * Math.PI) * sstep((un - 1.2) / 0.3), 0.9, up, 0.2, 0);
}
function dancePlane(C) {                       // airplane arms, swooping side to side along the table edge
  const P = C.P, e = C.e, un = C.un, amp = C.amp, p = un * TAU / 1.5;
  P.rx += Math.min(2.8, 2.0 * amp + 0.4) * Math.sin(p) * e; P.turn += 0.8 * Math.cos(p) * e; P.sway += 0.3 * Math.sin(p) * e; P.hop += 0.06 * Math.sin(2 * p) * e; P.lean += 0.12 * e;
  P.open += 0.7 * e; P.smile += e; P.lid -= 0.2 * e; P.browRaise += 0.4 * e; P.gazeCam = 1; P.earUp += 0.5 * e;
  for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 3.1, 1.7 + 0.15 * Math.sin(un * 7 + i), 0.2, e, 0, 1);
}
const RB_A = [[1.3, 2.0, 1.4], [1.4, 3.1, 1.0], [2.9, 1.9, 0.5], [1.0, 0.7, 1.2], [0.9, 1.5, 1.5], [1.6, 3.2, 0.7], [2.9, 1.9, 0.5], [1.3, 2.0, 1.4]];
const RB_B = [[-1.3, 2.0, 1.4], [-1.7, 0.6, 1.2], [-2.9, 1.9, 0.5], [-1.4, 3.1, 1.0], [-0.9, 1.5, 1.5], [-1.6, 3.2, 0.7], [-2.9, 1.9, 0.5], [-1.3, 2.0, 1.4]];
const RB_HEAD = [0, 0.5, 0.5, -0.5, -0.5, 0, 0.5, 0], RB_TURN = [0, 0.4, 0, -0.4, 0, 0.4, 0, -0.4];
function danceRobot(C) {                       // stiff, snapping poses on a beat
  const P = C.P, e = C.e, un = C.un, f = un / 0.4, n = Math.floor(f), k = sstep((f - n) / 0.28), i1 = n % 8, i0 = n > 0 ? (n - 1) % 8 : i1;
  P.armRate = 24;
  P.headYaw += lerp(RB_HEAD[i0], RB_HEAD[i1], k) * e; P.turn += lerp(RB_TURN[i0], RB_TURN[i1], k) * e;
  P.smile += 0.15 * e; P.lid += 0.06 * e; P.pupil -= 0.2 * e; P.browRaise += 0.2 * e; P.gazeCam = 1; P.lean += 0.04 * e;
  const A = RB_A, B = RB_B;
  C.arm(1, lerp(A[i0][0], A[i1][0], k), lerp(A[i0][1], A[i1][1], k), lerp(A[i0][2], A[i1][2], k), e, 0.3, 0.2);
  C.arm(0, lerp(B[i0][0], B[i1][0], k), lerp(B[i0][1], B[i1][1], k), lerp(B[i0][2], B[i1][2], k), e, 0.3, 0.2);
}
function danceShuffle(C) {                     // quick footwork, fists pumping low
  const P = C.P, e = C.e, un = C.un, amp = C.amp, p = un * TAU / 0.75;
  P.rx += (0.9 + 0.5 * amp) * Math.sin(p / 2) * e; P.hop += 0.08 * Math.abs(Math.sin(p)) * e; P.sway += 0.12 * Math.sin(p) * e; P.pitchAdd += 0.06 * Math.sin(2 * p) * e;
  P.smile += e; P.open += 0.5 * e; P.lid -= 0.2 * e; P.browRaise += 0.4 * e; P.gazeCam = 1; P.earUp += 0.4 * e;
  for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.5, 1.3 + 0.65 * Math.sin(p + i * Math.PI), 1.5, e, 0.4, 0);
}
function danceSpin(C) {                        // wind up, leap into a spin, land with arms up
  const P = C.P, e = C.e, un = C.un, turns = C.turns, sp = sstep((un - 0.7) / (turns > 1 ? 1.4 : 1.2)), ang = sp * TAU * turns;
  P.hop -= 0.15 * bump((un - 0.3) / 0.4) * e; P.hop += 0.35 * Math.sin(Math.PI * clamp((un - 1.0) / 1.3, 0, 1)) * e;
  P.turn += ang * e; P.smile += e; P.open += 0.6 * e; P.lid -= 0.25 * e; P.browRaise += 0.5 * e; P.gazeCam = 1; P.earUp += 0.5 * e;
  const out = Math.sin(Math.PI * clamp(sp, 0, 1)), fin = sstep((un - 2.3) / 0.3) * (1 - sstep((un - 2.8) / 0.2));
  for (let i = 0; i < 2; i++) {
    C.arm(i, ys(i) * 1.9, 2.6, 0.9, e * 0.8, 0.2, 1);
    if (out > 0.01) C.arm(i, ys(i) * 3.0, 1.9, 0.3, out * e, 0, 1);
    if (fin > 0.01) C.arm(i, ys(i) * 1.95, 3.55, 0.7, fin * e, 0.2, 1);
  }
  if (C.sty.flourish && C.once(1, un > 1.05)) C.fx(8, 3.0);
  if (C.sty.flourish && C.once(2, un > 1.9)) C.fx(8, 3.0);
}
function danceSky(C) {                         // point to the sky, one arm then both
  const P = C.P, e = C.e, un = C.un, a = sstep((un - 0.25) / 0.4) * (1 - sstep((un - 2.6) / 0.4)), b = sstep((un - 1.4) / 0.4) * (1 - sstep((un - 2.6) / 0.4));
  P.pitchAdd -= 0.45 * a * e; P.lean -= 0.2 * a * e; P.lid -= 0.5 * a * e; P.open += 0.6 * a * e; P.smile += e; P.browRaise += 0.4 * e; P.gazeCam = 1;
  P.hop += 0.1 * Math.abs(Math.sin(un * 8)) * sstep((un - 1.6) / 0.2) * (1 - sstep((un - 2.6) / 0.3)) * e;
  C.arm(1, 1.0, 3.95, 0.55, a * e, 0.1, 0.1);
  C.arm(0, -1.7, 2.4 + 0.5 * Math.sin(un * 7), 1.2, a * (1 - b) * 0.8 * e, 0.3, 0);
  C.arm(0, -1.0, 3.95, 0.55, b * e, 0.1, 0.1);
  if (C.sty.flourish && C.once(1, un > 0.9)) C.fx(10, 3.8);
}
const DANCES = { slide: danceSlide, plane: dancePlane, robot: danceRobot, shuffle: danceShuffle, spin: danceSpin, sky: danceSky };
MOOD.dance = { dur: 3.0, fn(C) { DANCES[C.sty.dances[C.v % C.sty.dances.length]](C); } };

// ---------- entrances and exits (raw: they drive the pose themselves; durations are real seconds) ----------
const ENTER = {
  sloth(C) {                                   // ambles in sideways, yawns, gives a slow wave
    const P = C.P, u = C.u, s = clamp(u / 2.6, 0, 1), we = 1 - sstep((u - 2.2) / 0.5), ph = u * TAU / 1.15, sw = Math.sin(ph);
    P.rx += C.side * C.out * Math.pow(1 - s, 1.4); P.hop += 0.05 * Math.abs(sw) * we; P.sway += 0.06 * sw * we; P.turn += -C.side * 0.75 * we;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.7, 0.4, 1.45 + 0.45 * Math.sin(ph + i * Math.PI), we, 0.55, 0.3);
    const yw = pulse(u, 2.7, 3.6, 0.4);
    P.open += 0.95 * yw; P.lid -= 0.55 * yw; P.pitchAdd -= 0.2 * yw; P.breathAmp += yw;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.2, 3.1, 0.7, yw * 0.8, 0.2, 1);
    const w = pulse(u, 3.5, 4.2, 0.25); P.smile += 0.5 * w; waveR(C, w, u * 0.6);
  },
  penguin(C) {                                 // waddles in, slides the last bit on its belly, waves
    const P = C.P, u = C.u, s = clamp(u / 2.0, 0, 1), we = 1 - sstep((u - 1.0) / 0.4), ph = u * TAU / 0.42, sl = pulse(u, 1.0, 1.75, 0.25);
    P.rx += C.side * C.out * (1 - s) * (1 - s); P.sway += 0.17 * Math.sin(ph) * we; P.hop += 0.05 * Math.abs(Math.sin(ph)) * we; P.turn += -C.side * 0.7 * we;
    P.lean += 0.55 * sl; P.slide += 0.2 * sl;
    for (let i = 0; i < 2; i++) { C.arm(i, ys(i) * 1.7, 0.4, 1.45, we, 0.55, 0.3); C.arm(i, ys(i) * 2.3, 0.9, -0.1, sl, 0, 1); }
    const w = pulse(u, 2.0, 3.1, 0.3); P.smile += 0.7 * w; P.open += 0.3 * w; waveR(C, w, u);
  },
  fox(C) {                                     // darts in, skids to a stop, flicks an ear, glances, waves
    const P = C.P, u = C.u, s = clamp(u / 0.55, 0, 1), re = 1 - sstep((u - 0.35) / 0.25), sk = pulse(u, 0.45, 0.85, 0.15), gl = bump((u - 1.0) / 0.7);
    P.rx += C.side * C.out * Math.pow(1 - s, 3); P.hop += 0.22 * Math.abs(Math.sin(u * TAU / 0.22)) * re; P.lean += 0.25 * re - 0.3 * sk; P.slide += 0.3 * sk; P.turn += -C.side * 0.9 * re;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.5, 0.5, 1.4 + 0.8 * Math.sin(u * TAU / 0.22 + i * Math.PI), re, 0.4, 0.2);
    P.earL += 0.6 * bump((u - 0.95) / 0.35); P.headYaw += 0.5 * gl * C.side; P.eyeAddX += 0.7 * gl * C.side;
    const w = pulse(u, 1.4, 2.2, 0.2); P.smile += 0.8 * w; P.open += 0.4 * w; waveR(C, w, u * 1.3);
  },
  owl(C) {                                     // glides down from above with flapping wings, lands softly
    const P = C.P, u = C.u, s = clamp(u / 1.9, 0, 1), fph = u * TAU / 0.55, fl = 1 - sstep((u - 1.7) / 0.25), lb = bump((u - 1.85) / 0.5);
    P.rx += C.side * 7 * (1 - s) * (1 - s); P.ry += 9 * Math.pow(1 - s, 1.6) + 0.35 * Math.sin(fph) * (1 - s); P.sway += -C.side * 0.3 * (1 - s); P.hop -= 0.22 * lb; P.shrug += 0.3 * lb;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 3.0, 1.9 + 1.3 * Math.sin(fph), 0.1, fl, 0, 1);
    P.headYaw += 0.8 * bump((u - 2.3) / 0.9) * C.side;
    const w = pulse(u, 2.4, 3.1, 0.25); P.smile += 0.5 * w; waveR(C, w, u);
  },
  wizard(C) {                                  // appears in a puff of stars, ta-da, a bow
    const P = C.P, u = C.u, sp = clamp((u - 0.12) / 0.7, 0, 1), tb = pulse(u, 0.9, 1.9, 0.25), bw = bump((u - 2.0) / 0.8);
    P.rScale = u < 0.1 ? 0.001 : Math.max(0.001, easeBack(sp, 0.5)); P.rYaw = (1 - sp) * TAU; P.ry += (1 - sp) * 0.8;
    if (C.once(1, u > 0.1)) C.fx(16, 3.2);
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 2.5, 3.0, 0.8, tb, 0.1, 1);
    P.hatLift += 0.1 * tb; P.smile += 0.6 * tb; P.browRaise += 0.4 * tb; P.pitchAdd += 0.3 * bw; P.lean += 0.1 * bw;
  },
  pip(C) {                                     // pops up from behind the table edge, hops, waves
    const P = C.P, u = C.u, s = clamp((u - 0.15) / 0.6, 0, 1), jb = bump((u - 0.9) / 0.4);
    P.ry += -5.6 * (1 - easeBack(s, 0.9)); P.turn += 0.6 * Math.sin(Math.PI * s); P.hop += 0.15 * bump(s) + 0.2 * jb;
    const w = pulse(u, 1.2, 2.4, 0.25); P.smile += 0.7 * w; P.open += 0.4 * w; P.hatTilt += 0.2 * Math.sin(u * 8) * w; waveR(C, w, u);
  }
};
const EXIT = {
  sloth(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.9) / 2.9, 0, 1), we = sstep((u - 0.9) / 0.3) * (1 - sstep((u - 3.6) / 0.2)), ph = u * TAU / 1.15;
    const w = pulse(u, 0.0, 0.9, 0.2); P.smile += 0.5 * w; waveR(C, w, u * 0.6);
    P.rx += C.side * C.out * Math.pow(s, 1.5); P.hop += 0.05 * Math.abs(Math.sin(ph)) * we; P.sway += 0.06 * Math.sin(ph) * we; P.turn += C.side * 0.75 * we;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.7, 0.4, 1.45 + 0.45 * Math.sin(ph + i * Math.PI), we, 0.55, 0.3);
  },
  penguin(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.8) / 1.6, 0, 1), we = sstep((u - 0.8) / 0.2) * (1 - sstep((u - 1.2) / 0.3)), ph = u * TAU / 0.42, sl = sstep((u - 0.9) / 0.25);
    const w = pulse(u, 0.0, 0.6, 0.15); P.smile += 0.7 * w; waveR(C, w, u);
    P.rx += C.side * C.out * s * s; P.sway += 0.17 * Math.sin(ph) * we; P.hop += 0.05 * Math.abs(Math.sin(ph)) * we; P.turn += C.side * 0.7 * Math.max(we, sl);
    P.lean += 0.55 * sl; P.slide += 0.2 * sl;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 2.3, 0.9, -0.1, sl, 0, 1);
  },
  fox(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.7) / 0.6, 0, 1), cr = pulse(u, 0.5, 0.7, 0.1), run = sstep((u - 0.65) / 0.1);
    const w = pulse(u, 0.0, 0.45, 0.12); P.smile += 0.8 * w; waveR(C, w, u * 1.3);
    P.lean += 0.25 * cr + 0.2 * run; P.slide -= 0.3 * cr; P.rx += C.side * C.out * s * s; P.hop += 0.2 * Math.abs(Math.sin(u * TAU / 0.22)) * run; P.turn += C.side * 0.9 * run;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.5, 0.5, 1.4 + 0.8 * Math.sin(u * TAU / 0.22 + i * Math.PI), run, 0.4, 0.2);
  },
  owl(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.5) / 2.0, 0, 1), fph = u * TAU / 0.55, fl = sstep((u - 0.3) / 0.2);
    P.hop -= 0.15 * bump((u - 0.2) / 0.35); P.ry += 11 * Math.pow(s, 1.7); P.rx += C.side * 5 * s * s; P.sway += C.side * 0.25 * s;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 3.0, 1.9 + 1.3 * Math.sin(fph), 0.1, fl, 0, 1);
    P.smile += 0.4 * pulse(u, 0, 0.5, 0.1);
  },
  wizard(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.9) / 0.7, 0, 1);
    const w = pulse(u, 0.0, 0.8, 0.2); P.smile += 0.6 * w; waveR(C, w, u);
    P.rScale = u > 1.65 ? 0.001 : Math.max(0.001, 1 - s * s); P.rYaw = s * TAU; P.ry += s * 0.6;
    if (C.once(1, u > 0.95)) C.fx(16, 3.2);
  },
  pip(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.7) / 0.7, 0, 1);
    const w = pulse(u, 0.0, 0.7, 0.15); P.smile += 0.7 * w; P.hatTilt += 0.2 * Math.sin(u * 8) * w; waveR(C, w, u);
    P.ry += -6 * s * s; P.hop += 0.12 * bump(u / 0.7); P.turn += 0.5 * Math.sin(Math.PI * s);
  }
};
const ENTER_DUR = { sloth: 4.5, penguin: 3.3, fox: 2.3, owl: 3.2, wizard: 3.0, pip: 2.6 };
const EXIT_DUR = { sloth: 3.8, penguin: 2.6, fox: 1.6, owl: 2.8, wizard: 2.2, pip: 1.8 };

// ---------- rare idle flairs: subtle, in character ----------
const FLAIR = {
  sloth(C) { const P = C.P, e = C.e, un = C.un, y = pulse(un, 0.3, 2.4, 0.8); P.open += 0.85 * y * e; P.lid -= 0.5 * y * e; P.pitchAdd -= 0.12 * y * e; P.shrug += 0.25 * y * e; P.breathAmp += 0.8 * y * e; },
  penguin(C) { const P = C.P, e = C.e, un = C.un, w = pulse(un, 0.2, 1.7, 0.45) * e; P.smile += 0.3 * w; P.shrug += 0.2 * w; for (let i = 0; i < 2; i++) C.arm(i, ys(i) * (2.2 + 0.4 * w), 1.8 + 0.6 * w, 0.5, w, 0.1, 1); },
  fox(C) { const P = C.P, e = C.e, un = C.un, g = bump((un - 0.7) / 0.8) * e; P.earL += 0.7 * bump((un - 0.1) / 0.45) * e; P.earR += 0.5 * bump((un - 0.2) / 0.45) * e; P.headYaw += 0.4 * g; P.eyeAddX += 0.8 * g; },
  owl(C) { const P = C.P, e = C.e, un = C.un, g = pulse(un, 0.3, 1.9, 0.5) * e; P.headYaw += 1.05 * g; P.pitchAdd += 0.05 * g; P.lid -= 0.1 * g; },
  wizard(C) { const P = C.P, e = C.e, un = C.un, w = pulse(un, 0.2, 1.6, 0.4) * e; C.arm(1, 0.55, 3.2, 0.7, w, 0.1, 0.5); P.hatTilt += 0.18 * Math.sin(un * 6) * w; P.hatLift += 0.06 * w; P.headRoll += 0.06 * w; P.smile += 0.3 * w; },
  pip(C) { const P = C.P, e = C.e, un = C.un, g = bump(un / 1.5) * e; P.headRoll += 0.12 * g; P.browRaise += 0.3 * g; P.hatTilt += 0.18 * Math.sin(un * 7) * g; P.eyeAddY += 0.5 * g; }
};

export const GEST = Object.assign({}, MOOD);
// internal gestures (not listed by T3.creatureMoods)
GEST.enter = { raw: true, abs: true, dur: (kind) => ENTER_DUR[kind] || 3, fn: (C) => (ENTER[C.kind] || ENTER.pip)(C) };
GEST.exit = { raw: true, abs: true, dur: (kind) => EXIT_DUR[kind] || 2, fn: (C) => (EXIT[C.kind] || EXIT.pip)(C) };
GEST.flair = { dur: 2.6, att: 0.25, rel: 0.6, fn: (C) => (FLAIR[C.kind] || FLAIR.pip)(C) };
export const MOOD_NAMES = Object.keys(MOOD);
export const DANCE_KEYS = Object.keys(DANCES);
