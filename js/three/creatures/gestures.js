// One-shot gestures for the creature opponents: reactions (moods), celebrations, entrances and exits.
//
// Reactions and celebrations are written as data per creature in ../acting.js (one calm move into a held pose, then
// back to rest; nothing loops). This file keeps the entrances / exits (they drive the pose themselves) and turns the
// mood names game.js uses into those specs.
// The runtime (../creatures.js) fills the context C each frame:
//   C.P (pose), C.u (seconds since start), C.un (u / the creature's tempo), C.e (fade multiplier 0..1),
//   C.sty (personality), C.kind (entrance set), C.who (which of the 15 opponents), C.v (variant), C.side (+1/-1: the
//   side it arrives from), C.out (world distance that is safely off screen), C.arm(i,x,y,z,w,align,open), C.fx(n,h)
//   (star burst), C.once(bit,cond), C.rest[i], C.geo (head / shoulder measurements), C.calm, C.blink().
// Arm targets are in the creature's own space (x sideways, y up, z toward the player), pre-rotated by P.turn,
// so set P.turn BEFORE calling C.arm. Shoulders sit at (+-1, 1.42); a hand at rest is at (+-1.75, 0.2, 1.45).
import { clamp, sstep, easeBack } from './common.js';
import { perform, specFor, ACTING_MOODS } from '../acting.js';

const TAU = Math.PI * 2;
const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));                 // 0 .. 1 .. 0 over x = 0..1
const pulse = (x, a, b, f) => sstep((x - a) / f) * (1 - sstep((x - b) / f));         // 0 -> 1 at a, 1 -> 0 at b
const ys = (i) => i * 2 - 1;                                                          // arm 0 = -1 (left of screen), arm 1 = +1

// a hello / goodbye wave: the hand comes up, ONE slow swing, and down again (w is its envelope)
function waveR(C, w, u) { if (w > 0) C.arm(1, 1.55 + Math.sin(u * 5.5) * 0.24, 3.15, 1.0, w, 0.2, 1); }

// ---------- reactions: every name game.js / social.js uses, played from the creature's own spec ----------
const NAMES = ['think', 'happy', 'sad', 'challenge', 'cry', 'tantrum', 'gloat', 'nod', 'gasp', 'nervous', 'laugh', 'facepalm', 'shrug', 'wave', 'clap', 'sleepy'];
const MOOD = {};
NAMES.concat(ACTING_MOODS, ['dance']).forEach((m) => {
  MOOD[m] = { own: true, dur: (who, v) => { const sp = specFor(who, m, v); return sp ? sp.dur : 2; }, fn(C) { const sp = specFor(C.who, m, C.v); if (sp) perform(C, sp); } };
});
MOOD.think.hold = true;       // held until the creature moves, reacts or the safety time runs out

// ---------- entrances and exits (raw: they drive the pose themselves; durations are real seconds) ----------
const ENTER = {
  sloth(C) {                                   // ambles in sideways, yawns, gives a slow wave
    const P = C.P, u = C.u, s = clamp(u / 2.6, 0, 1), we = 1 - sstep((u - 2.2) / 0.5), ph = u * TAU / 1.15, sw = Math.sin(ph);
    P.rx += C.side * C.out * Math.pow(1 - s, 1.4); P.hop += 0.05 * Math.abs(sw) * we; P.sway += 0.06 * sw * we; P.turn += -C.side * 0.75 * we;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.7, 0.4, 1.45 + 0.45 * Math.sin(ph + i * Math.PI), we, 0.55, 0.3);
    const yw = pulse(u, 2.7, 3.6, 0.4);
    P.open += 0.95 * yw; P.lid -= 0.55 * yw; P.pitchAdd -= 0.2 * yw; P.breath += 0.8 * yw;
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
// ---------- CAREER: the Legend League's entrances and exits ----------
Object.assign(ENTER, {
  robot(C) {                                   // rolls in smoothly (no steps), stops with a stiff little bounce, beeps, waves
    const P = C.P, u = C.u, s = clamp(u / 1.5, 0, 1), st = bump((u - 1.45) / 0.35), tl = pulse(u, 1.8, 2.5, 0.15);
    P.rx += C.side * C.out * Math.pow(1 - s, 2.2); P.lean += 0.12 * (1 - s) * (1 - s) - 0.08 * st; P.hop += 0.06 * st; P.turn += -C.side * 0.5 * (1 - sstep((u - 1.2) / 0.3));
    P.headRoll += 0.22 * tl * C.side; P.browRaise += 0.4 * tl; P.earUp += tl;
    const w = pulse(u, 2.4, 3.1, 0.2); P.smile += 0.7 * w + 0.3 * tl; P.open += 0.3 * w; waveR(C, w, u);
  },
  bat(C) { ENTER.owl(C); C.P.earUp += 0.5 * bump((C.u - 1.9) / 0.5); },          // glides down from above, flapping
  octopus(C) {                                 // rises up from behind the table edge, a happy wobble, waves
    const P = C.P, u = C.u, s = clamp((u - 0.1) / 1.0, 0, 1), wb = bump((u - 1.1) / 0.8);
    P.ry += -5.8 * (1 - easeBack(s, 0.6)); P.sway += 0.08 * Math.sin(u * 7) * wb; P.happyAmt = Math.max(P.happyAmt, 0.6 * wb);
    const w = pulse(u, 1.6, 2.7, 0.25); P.smile += 0.7 * w + 0.3 * wb; P.open += 0.3 * w; waveR(C, w, u);
  },
  dragon(C) {                                  // stomps in, heavy and slow, then a friendly (silent) roar
    const P = C.P, u = C.u, s = clamp(u / 2.4, 0, 1), we = 1 - sstep((u - 2.1) / 0.4), ph = u * TAU / 0.9, rr = pulse(u, 2.6, 3.4, 0.25);
    P.rx += C.side * C.out * Math.pow(1 - s, 1.5); P.hop += 0.08 * Math.abs(Math.sin(ph)) * we; P.sway += 0.08 * Math.sin(ph) * we; P.turn += -C.side * 0.7 * we;
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.8, 0.5, 1.4 + 0.3 * Math.sin(ph + i * Math.PI), we, 0.55, 0.3);
    P.open += 0.9 * rr; P.pitchAdd -= 0.25 * rr; P.browRaise += 0.4 * rr; P.happyAmt = Math.max(P.happyAmt, rr);
    for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 2.2, 2.9, 0.8, rr * 0.9, 0.2, 1);
  },
  chameleon(C) {                               // the Queen appears with a sparkle (blending in from nothing), then a royal bow
    const P = C.P, u = C.u, sp = clamp((u - 0.15) / 0.9, 0, 1), bw = bump((u - 1.5) / 1.0);
    P.rScale = u < 0.12 ? 0.001 : Math.max(0.001, easeBack(sp, 0.3)); P.happyAmt = Math.max(P.happyAmt, 1 - sp);
    if (C.once(1, u > 0.15)) C.fx(14, 3.6);
    P.pitchAdd += 0.3 * bw; P.lean += 0.1 * bw; P.smile += 0.6 * bw;
    C.arm(1, 1.2, 1.6, 1.6, bw, 0.3, 0.6);
  }
});
Object.assign(EXIT, {
  robot(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.8) / 1.2, 0, 1);
    const w = pulse(u, 0.0, 0.7, 0.15); P.smile += 0.7 * w; waveR(C, w, u);
    P.rx += C.side * C.out * Math.pow(s, 2.2); P.turn += C.side * 0.5 * sstep((u - 0.7) / 0.2); P.lean += 0.1 * s;
  },
  bat(C) { EXIT.owl(C); },
  octopus(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.7) / 0.8, 0, 1);
    const w = pulse(u, 0.0, 0.7, 0.15); P.smile += 0.7 * w; waveR(C, w, u);
    P.ry += -6 * s * s; P.sway += 0.06 * Math.sin(u * 7) * s;
  },
  dragon(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.9) / 2.2, 0, 1), we = sstep((u - 0.9) / 0.3), ph = u * TAU / 0.9;
    const w = pulse(u, 0.0, 0.9, 0.2); P.smile += 0.6 * w; waveR(C, w, u * 0.7);
    P.rx += C.side * C.out * Math.pow(s, 1.5); P.hop += 0.08 * Math.abs(Math.sin(ph)) * we; P.sway += 0.08 * Math.sin(ph) * we; P.turn += C.side * 0.7 * we;
  },
  chameleon(C) {
    const P = C.P, u = C.u, s = clamp((u - 0.9) / 0.7, 0, 1);
    const w = pulse(u, 0.0, 0.8, 0.2); P.smile += 0.6 * w; waveR(C, w, u);
    P.rScale = u > 1.65 ? 0.001 : Math.max(0.001, 1 - s * s); P.happyAmt = Math.max(P.happyAmt, s);
    if (C.once(1, u > 0.95)) C.fx(12, 3.6);
  }
});
// Grub the Grumpy Puglin: stomps in, folds his arms, one "hmph" nod (the sloth's yawn did not suit him)
ENTER.grub = function (C) {
  const P = C.P, u = C.u, s = clamp(u / 2.0, 0, 1), we = 1 - sstep((u - 1.8) / 0.35), ph = u * TAU / 0.8, fo = sstep((u - 2.0) / 0.4) * (1 - sstep((u - 3.3) / 0.4));
  P.rx += C.side * C.out * Math.pow(1 - s, 1.5); P.hop += 0.07 * Math.abs(Math.sin(ph)) * we; P.sway += 0.07 * Math.sin(ph) * we; P.turn += -C.side * 0.7 * we;
  for (let i = 0; i < 2; i++) C.arm(i, ys(i) * 1.7, 0.5, 1.4 + 0.3 * Math.sin(ph + i * Math.PI), we, 0.55, 0.3);
  for (let i = 0; i < 2; i++) C.arm(i, -ys(i) * 0.42 * C.geo.sx, C.geo.sy - 0.45 * C.geo.hr, C.geo.fz + 0.25, fo, 0.1, 0.25);
  P.pitchAdd += 0.22 * bump((u - 2.5) / 0.45) - 0.1 * fo; P.browTilt += 0.7 * fo; P.smile -= 0.25 * fo;
};
EXIT.grub = function (C) { EXIT.dragon(C); };
// Settings "calm" / reduced motion: no walking, flying or spinning. The creature is simply there, says hello with a
// raised hand (no swing) and settles; leaving, it raises a hand and is gone.
function calmEnter(C) { const P = C.P, u = C.u, w = pulse(u, 0.1, 1.3, 0.3); P.smile += 0.7 * w; P.browRaise += 0.3 * w; C.arm(1, 1.55, 3.15, 1.0, w, 0.2, 1); }
function calmExit(C) { const P = C.P, u = C.u, w = pulse(u, 0.0, 1.0, 0.25); P.smile += 0.6 * w; C.arm(1, 1.55, 3.15, 1.0, w, 0.2, 1); if (u > 1.15) P.rScale = 0.001; }
const ENTER_DUR = { sloth: 4.5, penguin: 3.3, fox: 2.3, owl: 3.2, wizard: 3.0, pip: 2.6, robot: 3.2, bat: 3.2, octopus: 2.9, dragon: 3.6, chameleon: 2.7, grub: 3.6 };
const EXIT_DUR = { sloth: 3.8, penguin: 2.6, fox: 1.6, owl: 2.8, wizard: 2.2, pip: 1.8, robot: 2.2, bat: 2.8, octopus: 1.7, dragon: 3.2, chameleon: 2.2, grub: 3.2 };

export const GEST = Object.assign({}, MOOD);
// internal gestures (not listed by T3.creatureMoods); dur(kind, who, calm)
GEST.enter = { raw: true, abs: true, dur: (kind, who, calm) => (calm ? 1.6 : ENTER_DUR[who] || ENTER_DUR[kind] || 3), fn: (C) => (C.calm ? calmEnter : ENTER[C.who] || ENTER[C.kind] || ENTER.pip)(C) };
GEST.exit = { raw: true, abs: true, dur: (kind, who, calm) => (calm ? 1.25 : EXIT_DUR[who] || EXIT_DUR[kind] || 2), fn: (C) => (C.calm ? calmExit : EXIT[C.who] || EXIT[C.kind] || EXIT.pip)(C) };
export const MOOD_NAMES = NAMES.concat(['dance'], ACTING_MOODS.filter((m) => m !== 'aha'));
