// The creatures' acting: who each of the 15 opponents is, what its face and body do for every reaction, how it thinks.
//
// The owner's rules (they shape everything in this file):
//   * a reaction is ONE calm, readable move that settles into a still pose (held), then eases back to rest;
//   * nothing loops, nothing twitches, nothing moves at rest (no breathing, no idle bobbing, no blink timers);
//   * friendly: proud, cheeky, sleepy or dramatic, never mean; a wrong answer is never belittled;
//   * Settings "calm" / prefers-reduced-motion: the move becomes a plain pose change (no hops, nods, travel or sparkles).
//
// How a reaction is written: a SPEC, pure data, played by perform() below.
//   { dur, att, rel,                 seconds (scaled by the creature's tempo); att = ease in, rel = ease back out
//     face: 'name' | [names], f: {}, a face preset (FACES) plus extra face values
//     body: { lean, pitch, roll, yaw, shrug, turn, sway, slide },   held body offsets (rad / actor units)
//     arms: [[pose, arm, weight?], ...],                             arm poses from POSES (arm 0 = screen left, 1 = right)
//     beats: [[kind, t, d, amount], ...],                            single beats (a nod, a hop, a sniff): each plays once
//     look: 'cam' | 'kid' | 'down' | 'up' | 'side' | 'away' | 'table' | 'goal' | 'partner' | 'sky',
//     glow, tint, eyeSplit,            robot antenna light 0..1, chameleon colour (-1 cool .. +1 warm), chameleon eyes apart
//     sweat, tear, puff,               one sweat bead / one tear / one puff of smoke (each forms once and goes)
//     fx, fxT, blink }                 a few star sparkles at fxT seconds; a single blink at the start
// Every persona overrides only what makes it itself; DEFAULTS fill the rest.
import { clamp, sstep } from './creatures/common.js';

const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));
export function env(u, dur, att, rel) { if (u < 0 || u > dur) return 0; return sstep(u / att) * (1 - sstep((u - (dur - rel)) / rel)); }

// ---------- who is who: the 15 opponents (OPPONENTS in js/config.js) by kind + pack ----------
const MONSTER_WHO = { sloth: 'grub', penguin: 'splosh', fox: 'blaze', owl: 'hex', wizard: 'messy' };
const CLASSIC_WHO = { sloth: 'snoozy', penguin: 'penny', fox: 'rusty', owl: 'ollie', wizard: 'mondo', pip: 'pip',
  robot: 'bleep', bat: 'flip', octopus: 'squiggle', dragon: 'nugget', chameleon: 'chroma' };
export function whoOf(kind, pack) { return (pack === 'monsters' ? MONSTER_WHO[kind] : CLASSIC_WHO[kind]) || 'pip'; }

// ---------- faces ----------
// Values add to the pose struct P (see creatures.js). happy / sad raise P.happyAmt / P.sadAmt (ears, tails, wings, colour).
export const FACES = {
  neutral: {},
  curious: { browRaise: 0.4, browAsym: 0.4, smile: 0.15, eyeWide: 0.15, lid: 0.04 },
  thinking: { browAsym: 0.6, browTilt: -0.12, smile: -0.12, lid: -0.14, mouthW: 0.75 },
  delighted: { smile: 1, lid: -0.32, browRaise: 0.45, open: 0.45, happy: 0.8, earUp: 0.5 },
  impressed: { eyeWide: 0.6, browRaise: 0.95, open: 0.5, mouthW: 0.55, smile: 0.25, pupil: 0.25, earUp: 0.6, lid: 0.08 },
  worried: { browTilt: -0.9, browRaise: 0.35, smile: -0.35, lid: -0.04, sad: 0.3, pupil: -0.2 },
  sheepish: { browTilt: -0.45, browRaise: 0.15, smile: 0.35, lid: -0.22 },
  proud: { lid: -0.28, smile: 0.85, browRaise: 0.15, browAsym: 0.35, happy: 0.4 },
  sleepy: { lid: -0.5, browRaise: -0.1, smile: 0.05 },
  sad: { browTilt: -0.8, browRaise: 0.15, smile: -0.7, lid: -0.15, sad: 0.8 },
  determined: { browTilt: 0.8, browRaise: -0.1, smile: 0.25, lid: -0.04, earUp: 0.6 },
  surprised: { eyeWide: 0.8, browRaise: 1, open: 0.7, mouthW: 0.6, pupil: -0.3, earUp: 1, lid: 0.1 },
  smug: { lid: -0.32, smile: 0.7, browAsym: 0.8, browTilt: 0.1 },
  grumpy: { browTilt: 0.7, smile: -0.3, lid: -0.1 },
  happy: { smile: 0.8, browRaise: 0.3, lid: -0.12, happy: 0.5 },
  content: { smile: 0.6, lid: -0.4, browRaise: 0.15, happy: 0.3 }
};
function addFace(P, F, w) {
  if (!F || !(w > 0)) return;
  for (const k in F) {
    const v = F[k] * w;
    if (k === 'happy') P.happyAmt = Math.max(P.happyAmt, v);
    else if (k === 'sad') P.sadAmt = Math.max(P.sadAmt, v);
    else if (k === 'mouthW') P.mouthW += (F[k] - 1) * w;
    else P[k] += v;
  }
}
export function face(P, name, w) {
  if (!name) return;
  if (Array.isArray(name)) { for (let i = 0; i < name.length; i++) addFace(P, FACES[name[i]], w / name.length * 1.4); return; }
  addFace(P, FACES[name], w);
}

// ---------- arm poses ----------
// Built from the creature's own measurements (C.geo, actor units): hc = head centre, hr = head radius, sy / sx = shoulder
// height / half width, rest = the resting hands. One table works for the code-built animals and the glTF monsters.
// Returns [x, y, z, align, open] for arm i (side s = -1 left of screen, +1 right).
function poseXYZ(name, C, i, u) {
  const g = C.geo, s = i ? 1 : -1, hc = g.hc, hr = g.hr, sy = g.sy, sx = g.sx, r = C.rest[i], fz = g.fz;
  switch (name) {
    case 'chin': return [s * 0.16 * hr, hc.y - 0.98 * hr, hc.z + 0.95 * hr, 0, 0.2];          // knuckles under the chin
    case 'cheek': return [s * 1.05 * hr, hc.y - 0.5 * hr, hc.z + 0.35 * hr, 0.1, 1];             // a hand flat on the cheek
    case 'mouth': return [s * 0.12 * hr, hc.y - 0.7 * hr, hc.z + 1.05 * hr, 0.2, 0.85];            // hand over the mouth
    case 'temple': return [s * 1.0 * hr, hc.y + 0.05 * hr, hc.z + 0.42 * hr, 0.2, 0.5];            // fingertips at the temple
    case 'head': return [s * 0.85 * hr, hc.y + 0.75 * hr, hc.z - 0.1 * hr, 0.25, 0.6];             // scratching the head
    case 'nap': return [s * 0.75 * hr, hc.y + 0.25 * hr, hc.z - 0.75 * hr, 0.4, 0.8];              // hands behind the head
    case 'beard': return [s * 0.2 * hr, hc.y - 1.45 * hr, hc.z + 1.05 * hr, 0.2, 0.35];            // stroking the beard / chest fur
    case 'hat': return [s * 0.65 * hr, hc.y + 1.05 * hr, hc.z + 0.45 * hr, 0.2, 0.15];             // gripping the hat brim
    case 'nose': return [s * 0.16 * hr, hc.y - 0.15 * hr, hc.z + 1.2 * hr, 0.2, 0.3];              // a tap on the nose
    case 'fold': return [s * -0.42 * sx, sy - 0.45 * hr, fz + 0.25, 0.1, 0.25];                    // arms folded across the chest
    case 'clasp': return [s * 0.2 * sx, sy - 0.35 * hr, fz + 0.5, 0.15, 0.85];                      // hands together in front
    case 'heart': return [s * 0.32 * sx, sy - 0.35 * hr, fz + 0.15, 0.05, 1];                       // a hand flat on the chest
    case 'belly': return [s * 0.35 * sx, sy - 1.15 * hr, fz + 0.2, 0.05, 1];                        // hands on the tummy
    case 'hip': return [s * 1.38 * sx, sy - 1.15 * hr, 0.25, 0.3, 0.1];                            // fist on the hip
    case 'behind': return [s * 0.55 * sx, sy - 1.2 * hr, -0.75, 0.3, 0.6];                          // hands behind the back
    case 'up': return [s * 1.2 * sx, hc.y + 1.5 * hr, hc.z + 0.15, 0.1, 1];                      // arm straight up, hand open
    case 'fist': return [s * 1.3 * sx, hc.y + 0.45 * hr, hc.z + 0.25, 0.15, 0];                     // fist up by the head (a pump)
    case 'finger': return [s * 1.0 * sx, hc.y + 0.7 * hr, hc.z + 0.45, 0.05, 0.1];               // one finger up: aha!
    case 'thumb': return [s * 1.25 * sx, sy + 0.7 * hr, fz + 0.55, 0.2, 0];                          // thumbs up, forward
    case 'point': return [s * 0.85 * sx, sy + 0.1 * hr, fz + 2.2, 0, 0.2];                          // pointing over the table
    case 'pointUp': return [s * 0.95 * sx, hc.y + 1.45 * hr, hc.z + 0.35, 0.05, 0.15];               // pointing at the sky
    case 'out': return [s * 2.3 * sx, sy + 0.05 * hr, 0.9, 0.05, 1];                               // arms wide
    case 'shrug': return [s * 2.05 * sx, sy - 0.25 * hr, fz + 0.65, 0.12, 1];                      // palms up
    case 'wings': return [s * 2.6 * sx, sy - 0.1 * hr, 0.2, 0, 1];                                  // wings / arms spread low
    case 'present': return [s * 1.6 * sx, sy - 0.25 * hr, fz + 1.45, 0.05, 1];                      // a palm offered forward
    case 'face': return [s * 0.15 * hr, hc.y + 0.1 * hr, hc.z + 1.15 * hr, 0.1, 0.95];             // hand over the eyes
    case 'tuck': return [r.x - s * 0.3, r.y - 0.3, r.z - 0.55, 0.55, 0.3];                          // drooped, hands drawn in
    case 'rim': return [r.x * 0.9, r.y + 0.05, r.z + 0.25, 0.6, 0.6];                               // leaning on the rail
    case 'wave': { const k = clamp((u - 0.3) / 1.1, 0, 1), sw = Math.sin(k * Math.PI * 2) * 0.28 * (1 - k * 0.4);   // one slow swing
      return [s * (1.45 * sx + sw), hc.y + 0.8 * hr, hc.z + 0.4, 0.2, 1]; }
    case 'clap': { const c = sstep((u - 0.2) / 0.18) * (1 - sstep((u - 0.42) / 0.14)) + sstep((u - 0.62) / 0.18);   // two claps, then hands held together
      const x = s * (0.18 + 0.6 * (1 - Math.min(1, c))) * sx; return [x, sy - 0.15 * hr, fz + 0.75, 0.15, 0.95]; }
    default: return null;
  }
}
function pose(C, name, i, w) {
  if (!(w > 0)) return;
  if (i === 'both') { pose(C, name, 0, w); pose(C, name, 1, w); return; }
  const q = poseXYZ(name, C, i, C.un); if (!q) return;
  C.arm(i, q[0], q[1], q[2], w, q[3], q[4]);
}

// ---------- single beats ----------
function beat(C, b, u, e) {
  const P = C.P, k = b[0], t = b[1] || 0, d = b[2] || 0.5, a = b[3] == null ? 1 : b[3], x = bump((u - t) / d) * e;
  if (!x) return;
  switch (k) {
    case 'nod': P.pitchAdd += a * x; break;                               // head dips once
    case 'hop': P.hop += a * x; break;                                    // a single small hop
    case 'jolt': P.hop += a * x; P.eyeWide += 0.4 * x; break;             // a small start
    case 'tilt': P.headRoll += a * x; break;
    case 'bow': P.pitchAdd += a * x; P.lean += a * 0.6 * x; break;
    case 'sniff': P.shrug += a * x; P.pitchAdd -= 0.1 * a * x; break;     // shoulders lift once
    case 'sigh': P.breath += a * 2 * x; P.shrug += 0.3 * a * x; break;
    case 'gulp': P.gulp += a * x; break;
    case 'lift': P.hop += a * x; P.pitchAdd -= 0.6 * a * x; break;        // up on the toes, chin up
    case 'swivel': P.headYaw += a * x * (C.side || 1); break;              // a head turn out and back (owl)
    case 'blinkSlow': P.lid -= a * x; break;
    case 'glow': P.glow += a * x; break;
    case 'ears': P.earUp += a * x; break;
  }
}

// ---------- the performer ----------
// C.un: seconds since the reaction began (divided by the tempo); C.e: fade multiplier from the runtime (1, or easing out).
export function perform(C, R) {
  const P = C.P, u = C.un, calm = C.calm;
  const att = calm ? Math.max(0.5, R.att || 0.35) : (R.att || 0.35), e = env(u, R.dur, att, R.rel || 0.7) * C.e;
  if (e <= 0) return;
  face(P, R.face, e); addFace(P, R.f, e);
  const b = R.body;
  if (b) {
    P.lean += (b.lean || 0) * e; P.pitchAdd += (b.pitch || 0) * e; P.headRoll += (b.roll || 0) * e; P.headYaw += (b.yaw || 0) * e;
    P.shrug += (b.shrug || 0) * e; P.sway += (b.sway || 0) * e; P.slide += (calm ? 0 : b.slide || 0) * e; P.turn += (b.turn || 0) * e;
    if (b.hop) P.hop += (calm ? 0 : b.hop) * e;
  }
  if (R.beats && !calm) for (let i = 0; i < R.beats.length; i++) beat(C, R.beats[i], u, e);
  if (R.arms) for (let i = 0; i < R.arms.length; i++) { const a = R.arms[i]; pose(C, a[0], a[1], e * (a[2] == null ? 1 : a[2])); }
  if (R.look) { P.lookMode = R.look; P.lookW = Math.max(P.lookW, e); }
  if (R.glow) P.glow = Math.max(P.glow, R.glow * e);
  if (R.tint) P.tint += R.tint * e;
  if (R.eyeSplit) P.eyeSplit += R.eyeSplit * e;
  if (R.sweat) { P.sweat = Math.max(P.sweat, e * sstep((u - 0.35) / 0.25)); P.sweatT = Math.max(0, u - 0.35); }
  if (R.tear) { P.cry = Math.max(P.cry, e); P.cryT = Math.max(0, u - (R.tearT || 0.6)); }
  if (R.puff && !calm) { const pt = u - (R.puffT || 0.2); if (pt > 0 && pt < 1.6) { P.steam = Math.max(P.steam, R.puff); P.steamT = pt; } }
  if (R.fx && !calm && C.once(1, u > (R.fxT || 0.3))) C.fx(R.fx, R.fxH || 3);
  if (R.blink && C.once(2, u > (R.blinkT || 0))) C.blink();
}

// ---------- the reactions everybody has (a persona overrides what makes it itself) ----------
export const DEFAULTS = {
  // the creature's turn is being worked out: it settles into a thinking pose and HOLDS it (until it moves or reacts)
  think: { dur: 18, att: 0.55, rel: 0.5, face: 'thinking', arms: [['chin', 1]], body: { roll: 0.14, pitch: 0.05 }, look: 'up', blink: true },
  // decisive beat right before it reaches for the cube
  aha: { dur: 0.95, att: 0.12, rel: 0.45, face: 'surprised', f: { smile: 0.6, open: -0.2 }, beats: [['jolt', 0, 0.32, 0.08]], arms: [['finger', 1]] },
  // the kid made a good move
  nod: { dur: 1.9, att: 0.3, face: 'happy', beats: [['nod', 0.35, 0.55, 0.26]], look: 'kid' },
  gasp: { dur: 2.0, att: 0.15, face: 'impressed', beats: [['jolt', 0, 0.3, 0.12]], arms: [['mouth', 1]], body: { lean: -0.08 }, look: 'kid' },
  // the creature challenges (Now! / Impossible!)
  challenge: { dur: 2.0, att: 0.25, face: 'determined', f: { open: 0.55 }, arms: [['point', 1]], beats: [['hop', 0, 0.35, 0.08]], look: 'table' },
  // the creature is challenged
  nervous: { dur: 2.8, att: 0.35, face: 'worried', arms: [['clasp', 'both']], beats: [['gulp', 1.2, 0.35]], body: { lean: -0.05 }, look: 'side', sweat: 1 },
  // it won a shake
  happy: { dur: 2.2, att: 0.3, face: 'delighted', arms: [['up', 'both']], beats: [['hop', 0.05, 0.45, 0.14]], look: 'cam' },
  gloat: { dur: 2.2, att: 0.4, face: 'smug', body: { pitch: -0.22, lean: -0.08, roll: 0.08 }, arms: [['hip', 0], ['heart', 1]], look: 'cam' },
  // it lost a shake
  sad: { dur: 2.6, att: 0.5, face: 'sad', beats: [['sigh', 0.2, 1.0, 0.6]], arms: [['tuck', 'both']], body: { lean: 0.12, pitch: 0.18 }, look: 'down' },
  cry: { dur: 2.8, att: 0.45, face: 'sad', f: { browTilt: -0.3 }, tear: 1, beats: [['sniff', 0.9, 0.5, 0.4]], arms: [['tuck', 'both']], body: { lean: 0.12, pitch: 0.12 }, look: 'down' },
  // it lost the match: a good loser's huff (arms folded, chin up, looks away), never a fit
  tantrum: { dur: 2.6, att: 0.45, face: 'grumpy', f: { smile: -0.1 }, arms: [['fold', 'both']], body: { pitch: -0.12, yaw: 0.4, lean: -0.04 }, look: 'away' },
  laugh: { dur: 1.9, att: 0.2, face: 'delighted', f: { lid: -0.25, open: 0.25 }, beats: [['lift', 0.15, 0.6, 0.12]], body: { pitch: -0.15 }, arms: [['belly', 'both']] },
  clap: { dur: 2.0, att: 0.2, face: 'happy', arms: [['clap', 'both']], look: 'kid' },
  shrug: { dur: 1.9, att: 0.25, face: 'curious', f: { smile: -0.25 }, arms: [['shrug', 'both']], body: { shrug: 1, roll: 0.12 } },
  wave: { dur: 2.0, att: 0.25, face: 'happy', arms: [['wave', 1]], look: 'cam' },
  facepalm: { dur: 2.2, att: 0.3, face: 'sheepish', arms: [['face', 1]], body: { pitch: 0.2 } },
  sleepy: { dur: 3.2, att: 0.6, face: 'sleepy', f: { open: 0.85 }, arms: [['up', 'both', 0.8]], body: { pitch: -0.22, lean: -0.1 }, beats: [['sigh', 0.3, 2.2, 0.5]] },
  // new names (docs/handoff/acting.md)
  impressed: { dur: 2.6, att: 0.2, face: 'impressed', arms: [['cheek', 'both']], body: { lean: -0.08 }, beats: [['jolt', 0, 0.3, 0.1]], look: 'goal' },
  proud: { dur: 2.4, att: 0.4, face: 'proud', arms: [['hip', 'both']], body: { pitch: -0.15, lean: -0.06 }, look: 'cam' },
  sheepish: { dur: 2.2, att: 0.35, face: 'sheepish', arms: [['head', 1]], body: { roll: 0.12, pitch: 0.08 }, look: 'side' },
  curious: { dur: 2.0, att: 0.35, face: 'curious', body: { roll: 0.16 }, look: 'table' },
  // the other creature at the table reacts to this one (a glance; flavour by what the other one did)
  glance: { dur: 1.7, att: 0.3, rel: 0.6, face: 'curious', look: 'partner' },
  jealous: { dur: 1.9, att: 0.35, rel: 0.6, face: 'grumpy', f: { smile: -0.05, lidAsym: -0.15, lid: -0.1 }, body: { roll: -0.06 }, look: 'partner' },
  sympathy: { dur: 1.9, att: 0.35, rel: 0.6, face: 'worried', f: { smile: 0.3 }, beats: [['nod', 0.4, 0.6, 0.15]], look: 'partner' },
  cheer: { dur: 1.9, att: 0.3, rel: 0.6, face: 'happy', beats: [['nod', 0.35, 0.5, 0.15]], look: 'partner' },
  // winning the match: ONE big celebration move into a held victory pose (three variants per creature)
  win: [
    { dur: 3.0, att: 0.4, face: 'delighted', f: { open: 0.3 }, arms: [['fist', 'both']], beats: [['hop', 0.1, 0.5, 0.25]], body: { pitch: -0.15 }, look: 'cam' },
    { dur: 3.0, att: 0.5, face: 'delighted', arms: [['pointUp', 1], ['heart', 0]], body: { pitch: -0.3, lean: -0.1 }, look: 'sky' },
    { dur: 3.0, att: 0.5, face: 'delighted', f: { open: 0.4 }, arms: [['up', 'both']], body: { slide: 1.0, lean: -0.3, pitch: -0.25, hop: -0.3 }, look: 'cam' }
  ]
};

// ---------- the 15 opponents (+ Pip) ----------
// rest: their own resting posture, constant (a silhouette, not a motion). The rest of each entry is that creature's own
// version of a reaction. Written to the character sheets in js/config.js (titles, think lines, tastes).
const PERSONA = {
  // 1 Snoozy the Sleepy Sloth: slow, half asleep, warm
  snoozy: {
    rest: { lean: 0.05, pitch: 0.03, roll: 0.05 },
    think: { dur: 18, att: 1.0, face: ['sleepy', 'thinking'], f: { lid: -0.15 }, arms: [['chin', 1]], body: { roll: 0.22, pitch: 0.02, lean: 0.04 }, look: 'table' },
    aha: { dur: 1.1, att: 0.18, rel: 0.5, face: 'surprised', f: { lid: 0.25, open: -0.3 }, beats: [['jolt', 0, 0.4, 0.07]], body: { pitch: -0.12 } },
    nod: { dur: 2.6, att: 0.6, face: 'content', beats: [['nod', 0.5, 1.0, 0.24]], body: { roll: 0.08 }, look: 'kid' },
    gasp: { dur: 2.6, att: 0.35, face: 'impressed', f: { lid: 0.2 }, arms: [['cheek', 'both']], look: 'kid' },
    challenge: { dur: 2.4, att: 0.5, face: 'determined', f: { eyeWide: 0.35, open: 0.5, lid: 0.25 }, arms: [['point', 1]], look: 'table' },
    nervous: { dur: 3.0, att: 0.7, face: 'worried', f: { lid: 0.3 }, arms: [['cheek', 1]], body: { roll: -0.1, lean: -0.04 }, look: 'side', sweat: 1 },
    happy: { dur: 2.8, att: 0.7, face: 'delighted', f: { lid: -0.2 }, arms: [['up', 'both']], beats: [['lift', 0.3, 1.0, 0.1]], look: 'cam' },
    gloat: { dur: 2.8, att: 0.7, face: 'smug', f: { lid: -0.3 }, arms: [['nap', 'both']], body: { lean: -0.12, pitch: -0.16 }, look: 'cam' },
    tantrum: { dur: 3.0, att: 0.8, face: 'sleepy', f: { lid: -0.35, smile: 0.25 }, arms: [['fold', 'both']], body: { pitch: 0.2, lean: 0.12, roll: 0.15 }, look: 'down' },   // "Zzz... you got me!"
    win: [{ dur: 3.2, att: 0.8, face: 'content', f: { open: 0.3 }, arms: [['up', 'both']], body: { pitch: -0.25, lean: -0.1 }, beats: [['sigh', 0.5, 1.6, 0.6]], look: 'sky' },
      { dur: 3.2, att: 0.8, face: 'content', arms: [['nap', 'both']], body: { lean: -0.14, pitch: -0.2 }, look: 'cam' },
      { dur: 3.2, att: 0.7, face: 'delighted', f: { lid: -0.2 }, arms: [['pointUp', 1]], body: { pitch: -0.25 }, look: 'sky' }]
  },
  // 2 Penny the Puzzle Penguin: neat, bright, quick little flipper moves
  penny: {
    rest: { pitch: -0.03 },
    think: { dur: 18, att: 0.4, face: 'thinking', f: { browAsym: 0.2 }, arms: [['wings', 'both', 0.35]], body: { roll: 0.3, pitch: 0.22 }, look: 'down' },   // head tipped sideways over the puzzle
    aha: { dur: 0.9, att: 0.1, face: 'surprised', f: { smile: 0.5 }, arms: [['wings', 'both', 0.8]], beats: [['hop', 0, 0.3, 0.12]] },
    nod: { dur: 2.0, att: 0.2, face: 'happy', arms: [['clap', 'both']], look: 'kid' },
    gasp: { dur: 2.0, att: 0.12, face: 'impressed', arms: [['wings', 'both']], beats: [['jolt', 0, 0.3, 0.14]], look: 'kid' },
    challenge: { dur: 2.0, att: 0.2, face: 'determined', f: { open: 0.6 }, arms: [['up', 'both']], beats: [['hop', 0, 0.35, 0.12]], look: 'table' },  // "Flippers up!"
    nervous: { dur: 2.8, att: 0.3, face: 'worried', arms: [['clasp', 'both']], body: { shrug: 0.4 }, look: 'side', sweat: 1 },
    happy: { dur: 2.2, att: 0.25, face: 'delighted', arms: [['wings', 'both']], beats: [['hop', 0.05, 0.45, 0.18]], look: 'cam' },
    sad: { dur: 2.6, att: 0.4, face: 'sad', arms: [['tuck', 'both']], body: { pitch: 0.25, lean: 0.08 }, look: 'down' },
    win: [{ dur: 3.0, att: 0.35, face: 'delighted', f: { open: 0.4 }, arms: [['wings', 'both']], body: { slide: 0.6, lean: 0.4 }, look: 'cam' },   // a belly-slide lean, flippers back
      { dur: 3.0, att: 0.35, face: 'delighted', arms: [['up', 'both']], beats: [['hop', 0.1, 0.5, 0.25]], look: 'cam' },
      { dur: 3.0, att: 0.4, face: 'proud', arms: [['wings', 'both']], body: { turn: 0.4, pitch: -0.15 }, look: 'cam' }]
  },
  // 3 Rusty the Clever Fox: quick, sly, a grin and an ear flick
  rusty: {
    rest: { roll: -0.04, pitch: -0.03 },
    think: { dur: 18, att: 0.3, face: 'smug', f: { lid: -0.05, browAsym: 0.3, earL: 0.5 }, arms: [['chin', 1]], body: { roll: -0.12 }, look: 'table' },   // sly squint at the cubes
    aha: { dur: 0.8, att: 0.08, rel: 0.4, face: 'smug', f: { smile: 0.4, browRaise: 0.5, earUp: 0.6 }, beats: [['ears', 0, 0.3, 0.6], ['tilt', 0, 0.35, 0.1]] },
    nod: { dur: 1.9, att: 0.2, face: 'curious', f: { smile: 0.5 }, arms: [['thumb', 1]], beats: [['nod', 0.25, 0.45, 0.2], ['ears', 0.1, 0.4, 0.6]], body: { roll: 0.1 }, look: 'kid' },   // "not bad!"
    gasp: { dur: 1.9, att: 0.1, face: 'impressed', f: { earL: -0.3, earR: -0.3 }, arms: [['nose', 1]], look: 'kid' },
    challenge: { dur: 1.8, att: 0.15, face: 'smug', f: { open: 0.5, browTilt: 0.5, earUp: 1 }, arms: [['point', 1]], beats: [['hop', 0, 0.3, 0.08]], look: 'table' },   // "Gotcha!"
    nervous: { dur: 2.6, att: 0.25, face: 'sheepish', f: { earL: 0.7, earR: 0.7, smile: 0.1 }, arms: [['head', 1]], look: 'side', sweat: 1 },
    gloat: { dur: 2.0, att: 0.3, face: 'smug', arms: [['nose', 1], ['hip', 0]], body: { roll: 0.1, pitch: -0.12 }, look: 'cam' },
    tantrum: { dur: 2.4, att: 0.35, face: 'sheepish', f: { earL: 0.6, earR: 0.6 }, arms: [['head', 1]], body: { roll: 0.14 }, look: 'side' },   // "Outfoxed!"
    win: [{ dur: 3.0, att: 0.3, face: 'delighted', f: { open: 0.5 }, arms: [['fist', 'both']], body: { slide: 1.0, lean: -0.3, pitch: -0.25, hop: -0.3 }, look: 'cam' },   // knee slide
      { dur: 3.0, att: 0.3, face: 'smug', arms: [['out', 'both']], body: { turn: 0.5, sway: 0.1 }, look: 'cam' },
      { dur: 3.0, att: 0.3, face: 'delighted', arms: [['fist', 1], ['hip', 0]], beats: [['hop', 0.05, 0.45, 0.2]], look: 'cam' }]
  },
  // 4 Ollie the Wise Owl: unhurried, the head turns, a slow wise blink
  ollie: {
    rest: { pitch: -0.02 },
    think: { dur: 18, att: 0.8, face: 'thinking', f: { lid: -0.1 }, body: { yaw: 0.45, roll: 0.12 }, arms: [['beard', 1, 0.6]], look: 'side' },   // the owl turns its head right round
    aha: { dur: 1.0, att: 0.18, face: 'surprised', f: { open: 0.4 }, beats: [['jolt', 0, 0.3, 0.06]], arms: [['finger', 1]] },
    nod: { dur: 2.4, att: 0.4, face: 'content', beats: [['blinkSlow', 0.3, 0.9, 0.6], ['nod', 0.5, 0.8, 0.2]], look: 'kid' },   // a slow, wise blink and nod
    gasp: { dur: 2.2, att: 0.12, face: 'impressed', f: { eyeWide: 0.3 }, body: { shrug: 0.4 }, beats: [['jolt', 0, 0.3, 0.1]], look: 'kid' },
    challenge: { dur: 2.0, att: 0.3, face: 'determined', f: { open: 0.6 }, arms: [['pointUp', 1]], look: 'table' },
    nervous: { dur: 2.8, att: 0.4, face: 'worried', body: { shrug: 0.5, yaw: -0.35 }, arms: [['tuck', 'both']], look: 'side', blink: true, blinkT: 0.5 },
    sad: { dur: 2.8, att: 0.5, face: 'sad', body: { pitch: 0.2, shrug: -0.3 }, arms: [['tuck', 'both']], look: 'down' },
    win: [{ dur: 3.0, att: 0.5, face: 'delighted', arms: [['wings', 'both']], beats: [['lift', 0.3, 0.8, 0.15]], look: 'cam' },
      { dur: 3.0, att: 0.5, face: 'proud', arms: [['pointUp', 1]], body: { pitch: -0.25 }, look: 'sky' },
      { dur: 3.0, att: 0.5, face: 'delighted', arms: [['up', 'both']], body: { pitch: -0.2 }, look: 'cam' }]
  },
  // 5 Mondo the Math Wizard: grand, theatrical, a sparkle now and then
  mondo: {
    rest: { pitch: -0.05, lean: -0.02 },
    think: { dur: 18, att: 0.6, face: 'thinking', f: { browAsym: 0.2 }, arms: [['beard', 1]], body: { pitch: -0.2, roll: 0.08 }, look: 'sky' },   // strokes the beard, eyes to the stars
    aha: { dur: 1.0, att: 0.12, face: 'surprised', f: { smile: 0.7 }, arms: [['finger', 1]], fx: 4, fxT: 0.15, fxH: 4 },
    nod: { dur: 2.2, att: 0.35, face: 'happy', arms: [['hat', 1]], beats: [['nod', 0.4, 0.6, 0.18]], look: 'kid' },   // tips his hat
    gasp: { dur: 2.2, att: 0.12, face: 'impressed', arms: [['beard', 1]], body: { lean: -0.1 }, look: 'kid' },
    challenge: { dur: 2.0, att: 0.25, face: 'determined', f: { open: 0.6 }, arms: [['point', 1]], fx: 5, fxT: 0.25, look: 'table' },
    nervous: { dur: 2.8, att: 0.35, face: 'worried', arms: [['hat', 1]], body: { pitch: 0.02, roll: -0.08 }, f: { hatTilt: 0.1 }, look: 'side', sweat: 1 },   // tugs the brim down
    gloat: { dur: 2.2, att: 0.35, face: 'smug', arms: [['beard', 1], ['hip', 0]], body: { pitch: -0.2 }, look: 'cam' },
    tantrum: { dur: 2.6, att: 0.4, face: 'sheepish', arms: [['hat', 1]], body: { pitch: 0.18 }, f: { hatTilt: -0.15 }, look: 'down' },   // "out-wizarded!"
    win: [{ dur: 3.0, att: 0.4, face: 'delighted', arms: [['up', 'both']], fx: 10, fxT: 0.4, fxH: 4, look: 'cam' },
      { dur: 3.0, att: 0.45, face: 'proud', arms: [['pointUp', 1], ['hip', 0]], fx: 8, fxT: 0.5, fxH: 4.5, look: 'sky' },
      { dur: 3.0, att: 0.4, face: 'delighted', arms: [['out', 'both']], body: { pitch: -0.2 }, fx: 8, fxT: 0.4, look: 'cam' }]
  },
  // 6 Grub the Grumpy Puglin: arms folded, grumbles, a grudging nod
  grub: {
    rest: { pitch: 0.04, lean: 0.03 },
    think: { dur: 18, att: 0.45, face: 'grumpy', arms: [['fold', 'both']], body: { pitch: 0.12 }, look: 'table' },
    aha: { dur: 0.9, att: 0.12, face: 'grumpy', f: { smile: 0.5 }, beats: [['nod', 0.05, 0.35, 0.22]] },   // a "hmph" nod
    nod: { dur: 2.0, att: 0.35, face: 'grumpy', f: { smile: 0.55 }, arms: [['fold', 'both']], beats: [['nod', 0.4, 0.5, 0.25]], look: 'kid' },   // a grudging nod
    gasp: { dur: 2.0, att: 0.15, face: 'impressed', f: { browTilt: 0.3 }, body: { lean: -0.1 }, look: 'kid' },
    challenge: { dur: 2.0, att: 0.2, face: 'determined', arms: [['point', 1]], beats: [['hop', 0, 0.35, 0.1]], look: 'table' },
    nervous: { dur: 2.6, att: 0.3, face: 'grumpy', f: { browTilt: -0.9 }, arms: [['fold', 'both']], body: { pitch: 0.15, yaw: -0.3 }, look: 'away' },
    happy: { dur: 2.2, att: 0.3, face: 'happy', arms: [['fist', 'both']], beats: [['hop', 0.05, 0.4, 0.12]], look: 'cam' },
    tantrum: { dur: 2.6, att: 0.4, face: 'grumpy', arms: [['fold', 'both']], body: { pitch: -0.15, yaw: 0.45 }, beats: [['nod', 0.6, 0.5, 0.15]], look: 'away' },   // "Hmph! Fine."
    win: [{ dur: 3.0, att: 0.35, face: 'happy', f: { smile: 0.2 }, arms: [['fist', 'both']], beats: [['hop', 0.1, 0.5, 0.2]], look: 'cam' },
      { dur: 3.0, att: 0.4, face: 'proud', arms: [['fold', 'both']], body: { pitch: -0.25 }, look: 'cam' },
      { dur: 3.0, att: 0.35, face: 'happy', arms: [['up', 'both']], look: 'cam' }]
  },
  // 7 Splosh the Careful Puglin: peers closely, hands together, tidy little joys
  splosh: {
    rest: { lean: 0.03 },
    think: { dur: 18, att: 0.5, face: 'thinking', f: { browTilt: -0.3, eyeWide: 0.1 }, arms: [['clasp', 'both']], body: { lean: 0.14, pitch: 0.2 }, look: 'table' },   // peers closely: check twice
    aha: { dur: 0.95, att: 0.12, face: 'happy', f: { eyeWide: 0.3 }, arms: [['clasp', 'both']], beats: [['hop', 0, 0.3, 0.1]] },
    nod: { dur: 2.0, att: 0.2, face: 'delighted', arms: [['cheek', 'both']], look: 'kid' },
    gasp: { dur: 2.0, att: 0.12, face: 'impressed', arms: [['mouth', 'both', 0.9]], look: 'kid' },
    nervous: { dur: 2.8, att: 0.25, face: 'worried', arms: [['mouth', 'both', 0.9]], body: { lean: -0.06 }, look: 'side', sweat: 1 },
    happy: { dur: 2.2, att: 0.25, face: 'delighted', arms: [['clasp', 'both']], beats: [['hop', 0.05, 0.4, 0.14]], look: 'cam' },
    win: [{ dur: 3.0, att: 0.35, face: 'delighted', arms: [['clasp', 'both']], beats: [['hop', 0.1, 0.5, 0.2]], look: 'cam' },
      { dur: 3.0, att: 0.35, face: 'delighted', arms: [['up', 'both']], look: 'cam' },
      { dur: 3.0, att: 0.35, face: 'proud', arms: [['cheek', 'both']], body: { roll: 0.12 }, look: 'cam' }]
  },
  // 8 Blaze the Fiery Imp: fast and keen, but one move at a time
  blaze: {
    rest: { lean: 0.06, pitch: -0.02 },
    think: { dur: 18, att: 0.2, face: 'determined', arms: [['fist', 'both', 0.45]], body: { lean: 0.12, pitch: 0.12 }, look: 'table' },   // crouched forward, eyes on the cubes
    aha: { dur: 0.75, att: 0.08, rel: 0.35, face: 'delighted', arms: [['fist', 1]], beats: [['hop', 0, 0.28, 0.12]] },
    nod: { dur: 1.8, att: 0.15, face: 'happy', arms: [['thumb', 1]], look: 'kid' },
    gasp: { dur: 1.8, att: 0.1, face: 'impressed', body: { lean: -0.12 }, beats: [['jolt', 0, 0.25, 0.14]], look: 'kid' },
    challenge: { dur: 1.8, att: 0.12, face: 'determined', arms: [['point', 1]], beats: [['hop', 0, 0.3, 0.14]], look: 'table' },   // "Sizzle! NOW!"
    nervous: { dur: 2.4, att: 0.2, face: 'worried', body: { lean: -0.12 }, arms: [['shrug', 'both', 0.6]], look: 'side' },
    tantrum: { dur: 2.4, att: 0.3, face: 'sheepish', arms: [['head', 1]], body: { pitch: 0.12 }, look: 'side' },   // "You put my fire out!"
    win: [{ dur: 3.0, att: 0.25, face: 'delighted', arms: [['fist', 'both']], beats: [['hop', 0.05, 0.45, 0.3]], look: 'cam' },
      { dur: 3.0, att: 0.25, face: 'delighted', arms: [['up', 'both']], body: { slide: 1.0, lean: -0.3, hop: -0.3 }, look: 'cam' },
      { dur: 3.0, att: 0.25, face: 'proud', arms: [['fist', 1], ['hip', 0]], look: 'cam' }]
  },
  // 9 Hex the Tricky Imp: fingertips together, a sly tilt, a wink of an eyebrow
  hex: {
    rest: { roll: 0.05 },
    think: { dur: 18, att: 0.45, face: 'smug', f: { browAsym: 0.4 }, arms: [['clasp', 'both']], body: { roll: 0.16, pitch: 0.06 }, look: 'table' },   // steepled fingers
    aha: { dur: 0.9, att: 0.1, face: 'smug', f: { browRaise: 0.6, smile: 0.4 }, arms: [['point', 1, 0.7]], beats: [['tilt', 0, 0.4, -0.12]] },
    nod: { dur: 1.9, att: 0.25, face: 'curious', f: { smile: 0.4 }, arms: [['nose', 1]], look: 'kid' },
    gasp: { dur: 1.9, att: 0.12, face: 'impressed', body: { roll: -0.1 }, look: 'kid' },
    nervous: { dur: 2.6, att: 0.3, face: 'sheepish', arms: [['behind', 'both']], body: { yaw: -0.35, pitch: -0.1 }, look: 'away' },   // innocent look away
    gloat: { dur: 2.0, att: 0.3, face: 'smug', arms: [['clasp', 'both']], body: { roll: 0.14 }, look: 'cam' },
    win: [{ dur: 3.0, att: 0.35, face: 'smug', f: { open: 0.3 }, arms: [['clasp', 'both']], body: { roll: 0.15, pitch: -0.15 }, look: 'cam' },
      { dur: 3.0, att: 0.3, face: 'delighted', arms: [['up', 'both']], beats: [['hop', 0.1, 0.45, 0.2]], look: 'cam' },
      { dur: 3.0, att: 0.35, face: 'proud', arms: [['present', 1], ['behind', 0]], look: 'cam' }]
  },
  // 10 Messy the Messy Imp King: royal and slow, chin up, the decree finger
  messy: {
    rest: { pitch: -0.08, lean: -0.05 },
    think: { dur: 18, att: 0.6, face: 'thinking', arms: [['chin', 1], ['fold', 0, 0.8]], body: { pitch: -0.12 }, look: 'table' },   // royal ponder
    aha: { dur: 1.0, att: 0.15, face: 'proud', arms: [['finger', 1]], body: { pitch: -0.15 } },   // the King decrees
    nod: { dur: 2.2, att: 0.4, face: 'proud', arms: [['present', 1]], beats: [['nod', 0.4, 0.7, 0.2]], look: 'kid' },   // a royal nod, palm out
    gasp: { dur: 2.2, att: 0.15, face: 'impressed', arms: [['heart', 1]], body: { lean: -0.1 }, look: 'kid' },
    challenge: { dur: 2.0, att: 0.3, face: 'determined', f: { open: 0.5 }, arms: [['pointUp', 1], ['hip', 0]], look: 'table' },
    nervous: { dur: 2.6, att: 0.4, face: 'worried', arms: [['heart', 1]], body: { pitch: -0.1 }, look: 'side' },
    gloat: { dur: 2.4, att: 0.4, face: 'proud', arms: [['behind', 'both']], body: { pitch: -0.25, lean: -0.08 }, look: 'cam' },
    tantrum: { dur: 2.6, att: 0.4, face: 'sheepish', arms: [['heart', 1]], beats: [['bow', 0.6, 0.9, 0.25]], look: 'kid' },   // "I bow to you"
    win: [{ dur: 3.0, att: 0.5, face: 'proud', arms: [['up', 'both']], body: { pitch: -0.2 }, look: 'cam' },
      { dur: 3.0, att: 0.5, face: 'proud', arms: [['behind', 'both']], body: { pitch: -0.3, lean: -0.1 }, look: 'cam' },
      { dur: 3.0, att: 0.5, face: 'delighted', arms: [['out', 'both']], look: 'cam' }]
  },
  // 11 Bleep the Busy Robot: precise; the antenna light comes on to compute, a "ding" when it has it
  bleep: {
    rest: { pitch: 0 },
    think: { dur: 18, att: 0.3, face: 'neutral', f: { browAsym: 0.5, pupil: -0.2 }, body: { roll: 0.3 }, look: 'up', glow: 0.7 },   // tilts, the light comes on once
    aha: { dur: 0.8, att: 0.06, rel: 0.4, face: 'surprised', f: { open: 0.2 }, beats: [['glow', 0, 0.4, 1]], arms: [['finger', 1]] },   // ding!
    nod: { dur: 1.8, att: 0.15, face: 'happy', arms: [['thumb', 1]], beats: [['glow', 0.1, 0.5, 0.8]], look: 'kid' },
    gasp: { dur: 1.8, att: 0.08, face: 'surprised', beats: [['glow', 0, 0.6, 1]], look: 'kid' },
    challenge: { dur: 1.8, att: 0.15, face: 'determined', arms: [['point', 1]], glow: 0.9, look: 'table' },
    nervous: { dur: 2.4, att: 0.2, face: 'worried', body: { roll: -0.2 }, arms: [['temple', 1]], beats: [['glow', 0.5, 0.4, 0.6], ['glow', 1.3, 0.4, 0.6]], look: 'side' },   // "loading..."
    happy: { dur: 2.0, att: 0.15, face: 'delighted', arms: [['up', 'both']], glow: 1, look: 'cam' },
    tantrum: { dur: 2.4, att: 0.3, face: 'sad', f: { lid: -0.4 }, body: { pitch: 0.25, roll: 0.15 }, arms: [['tuck', 'both']], look: 'down' },   // powering down: "Rebooting."
    win: [{ dur: 3.0, att: 0.15, face: 'delighted', arms: [['up', 'both']], glow: 1, look: 'cam' },
      { dur: 3.0, att: 0.15, face: 'happy', arms: [['thumb', 'both']], glow: 1, body: { turn: 0.35 }, look: 'cam' },
      { dur: 3.0, att: 0.15, face: 'proud', arms: [['hip', 'both']], glow: 1, look: 'cam' }]
  },
  // 12 Flip the Upside-down Bat: looks at things sideways, quick ears
  flip: {
    rest: { roll: 0.06 },
    think: { dur: 18, att: 0.45, face: 'thinking', f: { earL: 0.4 }, body: { roll: 0.55 }, arms: [['wings', 'both', 0.3]], look: 'table' },   // head way over: upside-down view
    aha: { dur: 0.85, att: 0.1, face: 'surprised', f: { smile: 0.5 }, beats: [['ears', 0, 0.35, 1]] },
    nod: { dur: 1.8, att: 0.2, face: 'happy', beats: [['ears', 0.1, 0.5, 1], ['tilt', 0.1, 0.6, 0.15]], look: 'kid' },
    gasp: { dur: 1.9, att: 0.1, face: 'impressed', arms: [['wings', 'both', 0.7]], look: 'kid' },
    nervous: { dur: 2.6, att: 0.3, face: 'worried', arms: [['clasp', 'both']], body: { shrug: 0.4 }, f: { earL: 0.8, earR: 0.8 }, look: 'side' },
    win: [{ dur: 3.0, att: 0.3, face: 'delighted', arms: [['wings', 'both']], beats: [['lift', 0.1, 0.6, 0.2]], look: 'cam' },
      { dur: 3.0, att: 0.3, face: 'delighted', body: { roll: 0.5 }, arms: [['up', 'both']], look: 'cam' },
      { dur: 3.0, att: 0.3, face: 'proud', arms: [['wings', 'both']], body: { turn: 0.5 }, look: 'cam' }]
  },
  // 13 Squiggle the Eight-Armed Octopus: soft, floaty, everything a little wavy-happy
  squiggle: {
    rest: { pitch: -0.02 },
    think: { dur: 18, att: 0.6, face: 'thinking', arms: [['temple', 1], ['chin', 0, 0.8]], body: { roll: -0.12 }, look: 'up' },
    aha: { dur: 0.95, att: 0.12, face: 'delighted', arms: [['up', 'both', 0.6]], beats: [['lift', 0, 0.4, 0.1]] },
    nod: { dur: 2.0, att: 0.3, face: 'happy', f: { happy: 0.9 }, beats: [['nod', 0.35, 0.6, 0.2]], look: 'kid' },
    gasp: { dur: 2.0, att: 0.12, face: 'impressed', f: { happy: 0.6 }, arms: [['cheek', 'both']], look: 'kid' },
    nervous: { dur: 2.6, att: 0.35, face: 'worried', arms: [['clasp', 'both']], f: { sad: 0.6 }, look: 'side', sweat: 1 },   // arms curl in
    win: [{ dur: 3.0, att: 0.4, face: 'delighted', f: { happy: 1 }, arms: [['up', 'both']], look: 'cam' },
      { dur: 3.0, att: 0.4, face: 'delighted', f: { happy: 1 }, arms: [['out', 'both']], body: { turn: 0.4 }, look: 'cam' },
      { dur: 3.0, att: 0.4, face: 'proud', f: { happy: 1 }, arms: [['wave', 1], ['up', 0]], look: 'cam' }]
  },
  // 14 Nugget the Treasure Dragon: never rushes; eyes close to think, a happy puff of smoke
  nugget: {
    rest: { pitch: -0.04, lean: -0.02 },
    think: { dur: 18, att: 0.9, face: 'content', f: { lid: -0.45, smile: -0.2 }, arms: [['belly', 'both']], body: { pitch: -0.12 }, look: 'up' },   // "A dragon never rushes."
    aha: { dur: 1.2, att: 0.2, face: 'proud', f: { eyeWide: 0.2, lid: 0.2 }, puff: 1, puffT: 0.1 },
    nod: { dur: 2.4, att: 0.45, face: 'content', beats: [['nod', 0.4, 0.9, 0.22]], puff: 0.6, puffT: 0.5, look: 'kid' },
    gasp: { dur: 2.2, att: 0.15, face: 'impressed', arms: [['belly', 'both']], look: 'kid' },
    challenge: { dur: 2.2, att: 0.3, face: 'determined', f: { open: 0.8 }, arms: [['point', 1]], puff: 0.8, puffT: 0.3, look: 'table' },   // "ROAR! NOW!"
    nervous: { dur: 2.8, att: 0.4, face: 'worried', arms: [['belly', 'both']], body: { shrug: 0.3 }, look: 'side' },
    gloat: { dur: 2.4, att: 0.45, face: 'proud', arms: [['belly', 'both']], body: { pitch: -0.2, lean: -0.08 }, puff: 0.6, puffT: 0.6, look: 'cam' },
    win: [{ dur: 3.2, att: 0.5, face: 'delighted', arms: [['up', 'both']], puff: 1, puffT: 0.5, look: 'cam' },
      { dur: 3.2, att: 0.5, face: 'proud', arms: [['belly', 'both']], body: { pitch: -0.25 }, puff: 0.8, puffT: 0.6, look: 'cam' },
      { dur: 3.2, att: 0.5, face: 'delighted', arms: [['out', 'both']], look: 'cam' }]
  },
  // 15 Queen Chroma the Chameleon: calm and regal, eyes that look two ways, colours that follow her mood
  chroma: {
    rest: { pitch: -0.05 },
    think: { dur: 18, att: 0.6, face: 'thinking', f: { lid: -0.05 }, eyeSplit: 1, tint: -0.6, arms: [['chin', 1]], body: { roll: 0.08 }, look: 'table' },   // one eye on the cubes, one wandering
    aha: { dur: 1.0, att: 0.12, face: 'proud', f: { eyeWide: 0.3 }, tint: 1 },   // both eyes snap together, her colour warms
    nod: { dur: 2.2, att: 0.4, face: 'proud', tint: 0.6, beats: [['nod', 0.4, 0.7, 0.18]], look: 'kid' },   // a gracious nod
    gasp: { dur: 2.2, att: 0.15, face: 'impressed', tint: 0.8, arms: [['heart', 1]], look: 'kid' },
    nervous: { dur: 2.8, att: 0.4, face: 'worried', tint: -1, arms: [['heart', 1]], look: 'side' },   // her colour pales
    gloat: { dur: 2.4, att: 0.45, face: 'smug', tint: 0.8, arms: [['present', 1]], body: { pitch: -0.2 }, look: 'cam' },
    sad: { dur: 2.6, att: 0.5, face: 'sad', tint: -0.8, body: { pitch: 0.15 }, arms: [['tuck', 'both']], look: 'down' },
    win: [{ dur: 3.0, att: 0.5, face: 'proud', tint: 1, arms: [['present', 1], ['hip', 0]], fx: 8, fxT: 0.4, fxH: 4.5, look: 'cam' },
      { dur: 3.0, att: 0.5, face: 'delighted', tint: 1, arms: [['up', 'both']], fx: 8, fxT: 0.4, fxH: 4.5, look: 'cam' },
      { dur: 3.0, att: 0.5, face: 'proud', tint: 1, arms: [['behind', 'both']], body: { pitch: -0.25 }, look: 'cam' }]
  },
  pip: {}
};
// nervous and glances borrow, so every creature has every name
const ALIAS = { cry: 'sad' };

// the spec a creature plays for reaction m (persona first, then the shared default); v picks a 'win' variant
export function specFor(who, m, v) {
  const p = PERSONA[who] || PERSONA.pip;
  if (m === 'dance') { const w = p.win || DEFAULTS.win; return w[((v | 0) % w.length + w.length) % w.length]; }
  if (p[m]) return p[m];
  if (DEFAULTS[m]) return DEFAULTS[m];
  return ALIAS[m] ? specFor(who, ALIAS[m], v) : null;
}
export function restOf(who) { const p = PERSONA[who]; return (p && p.rest) || null; }
export function winCount(who) { const p = PERSONA[who] || PERSONA.pip; return (p.win || DEFAULTS.win).length; }
// how the other creature at the table answers this one's reaction m
export function partnerAnswer(m) {
  if (m === 'happy' || m === 'gloat' || m === 'dance' || m === 'laugh') return 'jealous';
  if (m === 'sad' || m === 'cry' || m === 'tantrum' || m === 'nervous') return 'sympathy';
  if (m === 'nod' || m === 'clap' || m === 'impressed' || m === 'gasp') return 'cheer';
  if (m === 'challenge') return 'glance';
  return null;
}
export const ACTING_MOODS = ['impressed', 'proud', 'sheepish', 'curious', 'aha', 'glance', 'jealous', 'sympathy', 'cheer'];
