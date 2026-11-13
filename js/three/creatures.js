// Creature opponents across the table. Plugs into the 3D table through T3.ctx (see js/three/table.js).
// One creature, or two at once (Three at the table): every creature has its own state (pose, task, gesture, talk,
// blinks, steps), so one can still be bringing its arm home while the other starts to move.
//
//   T3.setCreature(kind|null, packId?)   kinds: sloth penguin fox owl wizard pip. One creature at the table: it is
//                                        creature 0, any second creature leaves, and creature 0 is the one in use
//   T3.setCreatures([{kind, pack}, {kind, pack}?] | null)   one or two creatures at once (creature 0 and 1); in use: 0
//   T3.setCreature2(kind|null, packId?)  the second creature (creature 1) joins or leaves; creature 0 stays as it is
//   T3.creatureUse(i?)                   which creature (0 or 1) the calls below address; no argument: the current one
//   T3.creatureWith(i, fn)               runs fn() with creature i in use, then puts the previous choice back
//   T3.creatureCount()                   how many creatures are at the table (0, 1 or 2)
//   T3.creatureEnter(done?) / T3.creatureExit(done?)   arrive at / leave the table with a greeting or a goodbye; done fires once
//   T3.creatureMood(name|null, {variant}?)   one-shot reactions, see T3.creatureMoods(); `dance` has 3 variants per creature.
//                                        Each of the 15 opponents plays its own version (js/three/acting.js). 'think' is held
//                                        until the creature moves (then it has an "aha" beat first) or reacts.
//   T3.creatureMoods() -> array of supported mood names (unknown names are ignored; null eases back to rest)
//   T3.creatureTalk(ms)   the mouth moves for about ms (the line's length), then closes; the head tilts in once and holds
//   T3.creatureIdleFlair(on?)   kept for compatibility: idle flairs are gone (nothing moves at rest); always false
//   T3.creatureLook(what, ms?)   the creature in use looks at 'kid' | 'goal' | 'table' | 'cam' | 'partner' for ms (default 1400)
//   T3.creatureQuiet(i?) -> true when the creature in use (or i) has settled and asks for no frames (for tests)
//   T3.creatureMove(cubeId, zoneName, done)   reach, grab, carry, soft release; done() fires exactly once. The arm stretches
//                                             at most ARM_STRETCH (1.25x); the body shuffles, leans and steps for the rest
//   T3.creatureFocus(i?) -> { head: Vector3 (world), height } | null   for camera close-ups (the creature in use by default)
//   T3.creatureVisible(i?) -> bool        (the creature in use by default)
//   T3.creatureFrame(layout?, {topH, min, max, rootY, front, handX}?)   tuning hook for the framing (see FRAME); no args: current values
//   T3.creaturePacks() -> [{id, name, available}]
//   T3.creatureTempo = 1   (multiplies the duration of reaches; >1 slows them down, handy for inspecting poses)
//
// Seats. One creature stands behind the far edge, in the middle. With two, creature 0 stays (almost) in the middle and
// creature 1 stands at the far corner on the side away from the stadium scoreboard (left on wide screens, right on the
// tall layout), turned a touch toward each other (see PAIR; on the narrow tall table both are a little smaller so they
// fit side by side). Their heads stay inside the band the single creature already keeps in view, so the table does not
// shrink. The creature that is not moving a cube steps back and aside if the other one comes past it along the far
// edge (when the other one is out over the table it simply passes in front), watches a cube the other one carries,
// and glances over when the other one talks. Entrances and exits come from each one's own side, so they never cross.
//
// This file is the runtime (placement, gaze, gestures, reach/carry planner). Characters come from packs:
//   creatures/classic.js  code-built animals (always available)
//   creatures/gltfpack.js glTF monsters driven by assets/creatures/monsters/manifest.json (see assets/creatures/README.md);
//                         monsterrig.js drives their skeleton (IK arms, spine, head) from the same pose struct P and hand targets
//                         the classic creatures use, monsterwear.js builds their jersey / scarf / armband
// The one-shot gestures themselves (moods, dances, entrances, flairs) live in creatures/gestures.js.
// Style rule (the owner's): at rest NOTHING moves: no breathing, no blink timer, no idle flair. Every motion is a reaction to
// something that just happened, one calm move that settles into a still pose. When nothing changes, a creature asks for
// no frames at all (the render loop idles): see `quiet` in update().
import * as THREE from 'three';
import { clamp, lerp, sstep, easeIO, easeBack, easeOut } from './creatures/common.js';
import { buildClassic, HOLD, restPos } from './creatures/classic.js';
import { MonstersPack } from './creatures/gltfpack.js';
import { GEST, MOOD_NAMES } from './creatures/gestures.js';
import { whoOf, restOf, specFor, partnerAnswer, perform } from './acting.js';

var T3 = window.T3;
if (T3 && T3.ctx) (function () {
  var ctx = T3.ctx;
  // Framing: how big the creature stands behind the far table edge, per table layout. Every creature is scaled so the
  // top of its head (ears, hat, horns: actor.top) reaches the same world height topH. The camera fits the table plus that
  // top, so the table stays the same size whoever is playing, and short creatures (sloth, penguin, puglins) get as big
  // as the tall ones instead of leaving empty sky. actor.fit fine-tunes one character; min/max bound the scale.
  // rootY is the hips' height, front how far behind the far table edge the hips are, handX how far from the middle the
  // resting hands may lie (world units; on a tall screen the scoreboard is close behind the creature's shoulder).
  var FRAME = {
    wide: { topH: 6.5, min: 1.4, max: 2.3, rootY: 0.22, front: 1.95, handX: 4.0 },
    tall: { topH: 6.6, min: 1.4, max: 1.72, rootY: 0.22, front: 1.95, handX: 2.7 }
  };
  // Two creatures: where each stands (x of the hips, world), how big both are compared with one creature (s), a small resting body turn
  // toward the other one (rad), and how far from its own middle each one's resting hands may lie (world).
  // The stadium scoreboard hangs at the back on the right (wide) / left (tall): creature 1 stands on the other side.
  var PAIR = {
    wide: { s: 1, x: [0.7, -7.2], turn: [-0.08, 0.22], handX: [3.1, 2.4] },
    tall: { s: 0.8, x: [-0.6, 4.3], turn: [0.06, -0.22], handX: [2.15, 2.0] }
  };
  var BASE_LEAN = -0.13, TAU = Math.PI * 2;
  var ARM_STRETCH = 1.25;    // the reaching arm may stretch this much at most; the body leans and steps for the rest
  var LEAN_MAX = 0.55, SLIDE_MAX = 1.1, LIFT_MAX = 1.35;   // LIFT_MAX: hip height (world) once it is up over the table
  var fadeTime = 450;

  // ---------- packs ----------
  var packs = {
    classic: { id: 'classic', name: 'Classic', available: true, has: function () { return true; }, ready: function () { return true; }, build: function (k) { return buildClassic(k); } },
    monsters: MonstersPack
  };
  T3.creaturePacks = function () { return Object.keys(packs).map(function (id) { var p = packs[id]; return { id: id, name: p.name, available: !!p.available }; }); };
  T3.creaturePacksReady = MonstersPack.probe(ctx);
  T3.creatureMoods = function () { return MOOD_NAMES.slice(); };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function env(u, dur, att, rel) { if (u < 0 || u > dur) return 0; return sstep(u / att) * (1 - sstep((u - (dur - rel)) / rel)); }
  function sideLimit() { var W = ctx.layout ? ctx.layout.W : 18; return Math.min(W / 2 - 2.2, 6.5); }
  function resolvePack(packId) {
    var id = packId || (typeof S !== 'undefined' && S && S.cos && S.cos.pack) || 'classic';
    return (packs[id] && packs[id].available) ? id : 'classic';
  }
  // Settings "calm" (js/a11y.js) or the system's reduced-motion setting: reactions become plain pose changes
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function calmMode() { try { return (typeof A11y !== 'undefined' && A11y.calm && A11y.calm()) || !!(mqReduce && mqReduce.matches); } catch (e) { return false; } }
  function qualityLevel() { try { var q = T3.quality ? T3.quality() : 'high'; return q === 'low' ? 0 : q === 'medium' ? 1 : 2; } catch (e) { return 2; } }

  // ---------- star sparkles (wizard magic): one pool shared by the creatures ----------
  var fx = { sprites: null, live: 0, tex: null };
  function starTexture() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,250,200,.9)'); gr.addColorStop(1, 'rgba(255,230,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffe066'; g.strokeStyle = '#fff6c2'; g.lineWidth = 2; g.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 17; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fill(); g.stroke();
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function fxBurst(n, h, at, scale) {
    if (document.hidden) return;
    if (!fx.sprites) {
      fx.tex = starTexture(); fx.sprites = [];
      for (var i = 0; i < 24; i++) { var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); s.visible = false; s.renderOrder = 5; ctx.scene.add(s); s.userData = { life: 0, t0: 0 }; fx.sprites.push(s); }
    }
    var made = 0, ql = qualityLevel(); n = ql === 0 ? Math.ceil(n * 0.4) : ql === 1 ? Math.ceil(n * 0.7) : n;
    for (var j = 0; j < fx.sprites.length && made < n; j++) {
      var sp = fx.sprites[j], u = sp.userData; if (sp.visible) continue;
      var a = rnd(0, TAU), r = rnd(0.2, 0.9), up = rnd(0.5, 1.7);
      u.t0 = performance.now(); u.life = rnd(700, 1200); u.vx = Math.cos(a) * r * 3; u.vy = up * 2.2; u.vz = Math.sin(a) * r * 2 + 1; u.size = rnd(0.35, 0.7); u.spin = rnd(-3, 3);
      sp.position.set(at.x + Math.cos(a) * 0.3, at.y + h * scale, at.z + 1.0); sp.visible = true; sp.scale.setScalar(0.01); sp.material.opacity = 1; sp.material.rotation = rnd(0, 3); made++; fx.live++;
    }
    ctx.dirty(); ctx.startLoop();
  }
  function fxUpdate(now, dt) {
    if (!fx.live) return;
    for (var i = 0; i < fx.sprites.length; i++) {
      var sp = fx.sprites[i]; if (!sp.visible) continue;
      var u = sp.userData, k = (now - u.t0) / u.life;
      if (k >= 1) { sp.visible = false; fx.live--; continue; }
      sp.position.x += u.vx * dt; sp.position.y += u.vy * dt; sp.position.z += u.vz * dt; u.vy -= 3.2 * dt; u.vx *= 0.97; u.vz *= 0.97;
      sp.scale.setScalar(u.size * Math.sin(Math.PI * Math.min(1, k * 1.4)) + 0.02); sp.material.opacity = 1 - k * k; sp.material.rotation += u.spin * dt;
    }
  }

  // ---------- where a cube will come to rest in a zone (mirrors the slot layout in table.js; an approximation is fine) ----------
  function zoneArea(z) { var r = ctx.layout.z[z]; return { x: r[0] + 0.25, z: r[1] + 1.05, w: r[2] - 0.5, d: r[3] - 1.25 }; }
  var SLOT = { x: 0, z: 0, ok: false };
  function slotFor(id, zone) {
    SLOT.ok = false;
    var Gm = (typeof G !== 'undefined') ? G : null; if (!Gm || !Gm.cubes || !ctx.layout || !ctx.layout.z[zone]) return SLOT;
    var a = zoneArea(zone), i;
    if (zone === 'goal') {
      var gt = Gm.goalTokens || [], total = 1.2, before = 0;
      for (i = 0; i < gt.length; i++) { if (typeof gt[i] === 'object' && gt[i].id === id) continue; var wd = (gt[i] === '(' || gt[i] === ')') ? 0.55 : 1.2; before += wd; total += wd; }
      var gs = Math.min(1, a.w / Math.max(total, 1)), x0 = a.x + (a.w - total * gs) / 2;
      SLOT.x = x0 + before * gs + 0.6 * gs; SLOT.z = a.z + a.d / 2; SLOT.ok = true; return SLOT;
    }
    var n = 0; for (i = 0; i < Gm.cubes.length; i++) { var c = Gm.cubes[i]; if (c.zone === zone && c.id !== id) n++; }
    var cnt = n + 1, s = 1.25, cols, rows;
    while (s > 0.45) { cols = Math.max(1, Math.floor(a.w / s)); rows = Math.max(1, Math.floor(a.d / s)); if (cols * rows >= cnt) break; s -= 0.05; }
    cols = Math.max(1, Math.floor(a.w / s));
    var used = Math.min(cnt, cols), offx = (a.w - used * s) / 2, r = Math.floor(n / cols), cc = n % cols;
    SLOT.x = a.x + offx + s / 2 + cc * s; SLOT.z = a.z + s / 2 + r * s; SLOT.ok = true; return SLOT;
  }
  function cubeYaw(m) {
    var q = m.quaternion, vx = 1 - 2 * (q.y * q.y + q.z * q.z), vz = 2 * (q.x * q.z - q.w * q.y);
    var yw = Math.atan2(-vz, vx), q4 = Math.PI / 2; yw = yw - Math.round(yw / q4) * q4; return clamp(yw, -0.8, 0.8);
  }
  function armLen(A) { return (A.L1 + A.L2) * (A.k0 || 1); }

  // the pose values that, when they change, need a new frame
  var SIGKEYS = ['lean', 'hop', 'slide', 'turn', 'sway', 'headYaw', 'headPitch', 'headRoll', 'eyeX', 'eyeY', 'lid', 'blink', 'lidAsym', 'browRaise', 'browTilt', 'browAsym',
    'smile', 'open', 'shrug', 'happyAmt', 'sadAmt', 'eyeWide', 'pupil', 'mouthW', 'sweat', 'sweatT', 'gulp', 'earL', 'earR', 'earUp', 'hatTilt', 'hatLift', 'cry', 'cryT', 'steam', 'steamT',
    'angry', 'breath', 'glow', 'tint', 'eyeSplit', 'eyeAddX', 'eyeAddY'];
  var crs = [], use = 0, squeeze = 1;   // squeeze: set by the camera fit when the heads would not fit on a wide, short screen
  function pairOn() { return !!(crs[0] && crs[1] && crs[0].has() && crs[1].has()); }

  // =====================================================================================================
  // One creature: everything it is doing lives in here (its own pose, task, gesture, talk, blinks, steps).
  // =====================================================================================================
  function makeCreature(idx) {
    var self = {};
    var SCALE = 1.3, ROOT_Y = 0.22, FRONT = 1.95, seatTurn = 0;
    var actor = null, cur = { kind: null, pack: 'classic' }, hidden = false;
    var base = new THREE.Vector3(), rp = new THREE.Vector3(), headW = new THREE.Vector3(), lastNow = 0, lastScan = 0, lastUpdate = 0, serial = 0;
    var P = { breath: 0, breathAmp: 1, lean: 0, hop: 0, slide: 0, turn: 0, sway: 0, headYaw: 0, headPitch: 0, headRoll: 0, eyeX: 0, eyeY: 0, eyeAddX: 0, eyeAddY: 0, lid: 0.9, blink: 0, lidAsym: 0,
      browRaise: 0, browTilt: 0, browAsym: 0, smile: 0, open: 0, shrug: 0, happyAmt: 0, sadAmt: 0, dt: 0.016,
      rx: 0, ry: 0, rz: 0, rYaw: 0, rScale: 1, eyeWide: 0, pupil: 0, mouthW: 1, sweat: 0, sweatT: 0, gulp: 0, earL: 0, earR: 0, earUp: 0, hatTilt: 0, hatLift: 0, armRate: 9,
      gazeThink: 0, gazeSad: 0, gazeCam: 0, cry: 0, cryT: 0, steam: 0, steamT: 0, angry: 0, pitchAdd: 0, tailLift: 0, beardSway: 0, talk: 0, talkT: 0, task: 0,
      glow: 0, tint: 0, eyeSplit: 0, lookMode: null, lookW: 0 };
    var who = 'pip', restP = null;                                 // which of the 15 opponents this is (js/three/acting.js), its resting posture
    var task = null;
    var blinkT0 = -1e9;                                            // blinks happen only as part of something (a head turn, a surprise)
    var pose = 0;                                                  // 0..1 how far the body leans/slides/steps for a far reach
    var off = { x: 0, z: 0, px: 0, pz: 0, ph: 0 };                 // smoothed world-space step offsets while reaching
    var yld = { x: 0, z: 0 };                                      // smoothed step back / aside, making room for the other creature
    var talk = null, lastDance = {};
    var look = { what: null, until: 0 };                           // a short look asked for from outside (T3.creatureLook) or by an observer
    var ahaT0 = 0, ahaDur = 0, ahaFired = 0;                                     // the "aha" beat before a reach that follows a think
    var lastGm = null, quietT = 0, quiet = false, lastSig = new Float32Array(64), sigOK = false, quietFrames = 0;   // settled: no frames asked for
    var eyeG = new THREE.Vector3(), eyeInit = false, lastTgt = new THREE.Vector3(), lastTgtOK = false;
    var mv = { id: -1, until: 0, crowd: false }, lastPos = new Float32Array(24 * 3), lastPosOK = false;
    var gaze = new THREE.Vector3(), gazeInit = false, tgt = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpA = new THREE.Vector3(), DD = new THREE.Vector3();
    var armSt = [mkArm(), mkArm()], aAlign = [0.55, 0.55], aOpen = [0.3, 0.3];
    function mkArm() { return { goal: new THREE.Vector3(), des: new THREE.Vector3(), align: 0.55, open: 0.3, yaw: 0, init: false, wrist: new THREE.Vector3(), pw: new THREE.Vector3(), pwOK: false }; }
    var qBase = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), eul = new THREE.Euler();
    var tiltX = 0, tiltZ = 0;
    var stats = { max: 0 };

    // current gesture (a mood, dance, entrance/exit or idle flair): only one at a time per creature
    var gn = null, gv = 0, gT0 = 0, gDur = 0, gTempo = 1, gDone = null, gFired = 0, gSide = 1, gTimer = 0, fadeT0 = 0, pendingMood = null, gTimerSerial = 0;
    var C = { P: P, u: 0, un: 0, e: 0, sty: null, kind: '', who: 'pip', v: 0, side: 1, out: 15, amp: 1, turns: 1, calm: false, rest: [{ x: -1.6, y: 1.2, z: 1.2 }, { x: 1.6, y: 1.2, z: 1.2 }], arm: null, fx: null, once: null, blink: null,
      geo: { hc: new THREE.Vector3(0, 2.36, 0.1), hr: 1, sy: 1.42, sx: 1, fz: 0.8 } };

    function partner() { var o = crs[1 - idx]; return o && o.has() && o.visible() ? o : null; }
    // world <-> creature space. Nominal = relative to where the creature normally stands (ignores its current step offsets).
    function w2l(v) { v.x = (v.x - base.x) / SCALE; v.y = (v.y - base.y) / SCALE; v.z = (v.z - base.z) / SCALE; return v; }
    function l2w(v) { v.x = v.x * SCALE + rp.x; v.y = v.y * SCALE + rp.y; v.z = v.z * SCALE + rp.z; return v; }

    // the helpers the gestures use
    C.arm = function (i, x, y, z, w, al, op) {
      if (!(w > 0)) return; if (w > 1) w = 1;
      var ca = Math.cos(P.turn), sa = Math.sin(P.turn);
      tmpA.set(x * ca + z * sa, y, -x * sa + z * ca); armSt[i].des.lerp(tmpA, w);
      aAlign[i] += (al - aAlign[i]) * w; aOpen[i] += (op - aOpen[i]) * w;
    };
    C.once = function (bit, cond) { if (cond && !(gFired & bit)) { gFired |= bit; return true; } return false; };
    C.fx = function (n, h) { fxBurst(n, h, rp, SCALE); };
    C.blink = function () { blink(performance.now()); };
    function blink(now) { if (now - blinkT0 > 900) blinkT0 = now; }
    // head and shoulder measurements in the creature's own units, for the arm poses in acting.js
    function measure() {
      var g = C.geo, a = actor.arms[1], hc = actor.faceC || actor.headC;
      g.hc.copy(hc);
      g.sx = Math.abs(a.baseShoulder ? a.baseShoulder.x : 1) || 1; g.sy = a.baseShoulder ? a.baseShoulder.y : 1.42;
      g.hr = actor.headR || clamp((hc.y - g.sy) * 1.05, 0.45, 1.6);
      g.fz = actor.chestZ != null ? actor.chestZ : 0.8 * g.sx;
    }

    // ---------- placement ----------
    function place() {
      if (!actor || !ctx.layout) return;
      wake(); sigOK = false;                                          // a new seat or scale: draw the pose again from here
      var D = ctx.layout.D, W = ctx.layout.W, ln = ctx.layoutName === 'tall' ? 'tall' : 'wide', fr = FRAME[ln] || FRAME.wide;
      var pr = pairOn() ? PAIR[ln] : null, seatX = pr ? pr.x[idx] : 0;
      SCALE = clamp((fr.topH - fr.rootY) / (actor.top || 4), fr.min, fr.max) * (actor.fit || 1) * squeeze * (pr ? pr.s : 1);
      ROOT_Y = fr.rootY + (actor.fitY || 0) * SCALE; FRONT = fr.front; seatTurn = pr ? pr.turn[idx] : 0;
      base.set(seatX, ROOT_Y, -D / 2 - FRONT);
      actor.root.position.copy(base); actor.root.scale.setScalar(SCALE); actor.root.updateMatrixWorld(true);
      rp.copy(base);
      headW.copy(actor.headC).multiplyScalar(SCALE).add(rp);
      // resting hands lie on the far rim, never on the Goal zone (the bigger the creature, the further its hands would come in)
      // and stay within handX of its middle (wide creatures would otherwise cover the scoreboard on a tall screen); next to
      // another creature they also stay on the table's corner instead of hanging past its end
      var rimZ = (FRONT - 0.6) / SCALE, hx = pr ? pr.handX[idx] : (fr.handX || 4), edge = W / 2 + 0.25;
      for (var i = 0; i < 2; i++) {
        var a = actor.arms[i]; armSt[i].init = false;
        if (!a.rest0) a.rest0 = (a.rest || restPos(a.side)).clone();
        a.rest = a.rest || a.rest0.clone(); a.rest.copy(a.rest0); if (a.rest.z > rimZ) a.rest.z = rimZ;
        var sg = a.rest.x < 0 ? -1 : 1, lim = hx;
        if (pr) lim = Math.min(lim, Math.max(0.6, edge - sg * seatX));     // not past the table's end on the outer side
        lim /= SCALE;
        if (Math.abs(a.rest.x) > lim) a.rest.x = sg * Math.max(lim, Math.abs(a.baseShoulder ? a.baseShoulder.x : 1) + 0.35);
        C.rest[i] = a.rest;
      }
    }

    // ---------- install / clear ----------
    function clearActor() {
      if (!actor) return;
      abortTask(); endGesture(); talk = null; pendingMood = null;
      ctx.scene.remove(actor.root); if (actor.dispose) actor.dispose();
      actor.root.traverse(function (o) { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } });
      actor = null;
    }
    function install(a, kind, packId) {
      clearActor(); actor = a; cur = { kind: kind, pack: packId };
      ctx.scene.add(a.root); gazeInit = false; eyeInit = false; lastTgtOK = false; lastPosOK = false; gn = null; leanReset(); hidden = false; a.root.visible = true; C.sty = a.style; C.kind = a.styleKey || kind;
      C.who = who; restP = restOf(who); measure(); wake(); sigOK = false; place(); ctx.refit(); ctx.dirty(); ctx.startLoop();
    }
    function leanReset() { tiltX = tiltZ = 0; pose = 0; off.x = off.z = 0; yld.x = yld.z = 0; }
    // The classic stand-in is showing while a model loads: swap the real one in once it is ready and the creature is idle
    // (not entering, reaching, reacting or talking). A creature that has already left the table stays hidden.
    function swapIn(my, pid, kind) {
      (function swap() {
        if (my !== serial) return;
        if (task || gn || talk) { setTimeout(swap, 400); return; }
        var wasHidden = hidden;
        try { install(packs[pid].build(kind), kind, pid); if (wasHidden) setHidden(true); } catch (e) { console.warn('creature swap failed', e); }
      })();
    }
    self.set = function (kind, packId) {
      var my = ++serial;
      if (!kind) { clearActor(); cur = { kind: null, pack: 'classic' }; return; }
      var want = packId || (typeof S !== 'undefined' && S && S.cos && S.cos.pack) || 'classic';
      who = whoOf(kind, want);
      var pid = resolvePack(packId), pk = packs[pid];
      if (pid !== 'classic' && !pk.has(kind)) pid = 'classic';
      try {
        if (pid === 'classic' && want !== 'classic' && packs[want] && packs[want].settled === false) {
          // the pack's manifest is still being read (a very early call): stand in with classic, then upgrade
          install(buildClassic(kind), kind, 'classic');
          packs[want].probe().then(function (ok) {
            if (my !== serial || !ok || !packs[want].has(kind)) return;
            return packs[want].load(kind, ctx).then(function () { swapIn(my, want, kind); });
          }).catch(function (e) { console.warn('creature model failed to load', e); });
          return;
        }
        if (pid !== 'classic' && !packs[pid].ready(kind)) {
          // model still loading: show the classic stand-in now, swap when the model arrives and the creature is idle
          install(buildClassic(kind), kind, 'classic');
          packs[pid].load(kind, ctx).then(function () { swapIn(my, pid, kind); }).catch(function (e) { console.warn('creature model failed to load', e); });
          return;
        }
        install(pid === 'classic' ? buildClassic(kind) : packs[pid].build(kind), kind, pid);
      } catch (e) { console.warn('creature build failed, using classic', e); try { install(buildClassic(kind), kind, 'classic'); } catch (e2) { console.warn(e2); } }
    };
    self.has = function () { return !!actor; };
    self.kind = function () { return cur.kind; };
    self.actor = function () { return actor; };

    // ----- gestures -----
    function setHidden(h) { hidden = h; if (actor) actor.root.visible = !h; wake(); ctx.dirty(); }
    function wake() { quiet = false; quietFrames = 0; }
    function startGesture(n, v, done, now) {
      endGesture();
      var d = GEST[n], sty = actor.style;
      gn = n; gv = v | 0; gT0 = now; gFired = 0; fadeT0 = 0; gDone = done || null; gSide = Math.random() < 0.5 ? -1 : 1;
      // next to another creature it comes and goes on its own side, so the two never cross
      if ((n === 'enter' || n === 'exit') && pairOn()) gSide = base.x < (crs[1 - idx].baseX()) ? -1 : 1;
      gTempo = n === 'dance' ? clamp(sty.moodScale, 0.85, 1.15) : sty.moodScale;
      C.calm = calmMode();
      gDur = d.abs ? d.dur(actor.styleKey || cur.kind, who, C.calm) : (typeof d.dur === 'function' ? d.dur(who, gv) : d.dur) * gTempo;
      if (n === 'exit' && talk && !talk.cut) talk.cut = now;                   // leaving ends a line; reactions let the mouth finish it
      if (!d.raw && actor.playMood) actor.playMood(n);
      wake();
      if (gDone) { var my = ++gTimerSerial; gTimer = setTimeout(function () { if (gn && my === gTimerSerial) endGesture(); }, gDur * 1000 + 1500); }
      ctx.dirty(); ctx.startLoop();
    }
    function endGesture() {
      clearTimeout(gTimer); gTimerSerial++;
      var d = gDone, n = gn, pm = pendingMood; gDone = null; gn = null; fadeT0 = 0; pendingMood = null;
      if (n === 'exit') setHidden(true);
      if (d) { try { d(); } catch (e) { console.warn(e); } }
      if (n === 'enter' && actor) blink(performance.now());             // arrived: one blink as it settles
      if (n === 'enter' && pm && actor && !gn && !hidden) self.mood(pm.m, pm.o);
      wake();
    }
    self.mood = function (m, opts) {
      if (!actor) return;
      var now = performance.now();
      if (!m) { if (gn && !GEST[gn].raw && !fadeT0) fadeT0 = now; return; }      // null: ease back to rest
      if (!GEST[m] || m === 'enter' || m === 'exit' || m === 'flair') return;    // unknown names are ignored
      if (hidden || gn === 'exit') return;
      if (gn === 'enter') { pendingMood = { m: m, o: opts }; return; }           // plays right after the entrance
      var v = 0;
      if (m === 'dance') {
        var n = actor.style.dances.length;
        if (opts && opts.variant != null) v = ((opts.variant | 0) % n + n) % n;
        else { v = Math.floor(Math.random() * n); if (n > 1 && v === lastDance[cur.kind]) v = (v + 1 + Math.floor(Math.random() * (n - 1))) % n; }
        lastDance[cur.kind] = v;
      }
      startGesture(m, v, null, now);
      // the other creature at the table answers a beat later (a glance, a nod, a jealous look) if it is free
      var ans = partnerAnswer(m), o = partner();
      if (ans && o) setTimeout(function () { if (actor && gn === m && o.has() && o.free()) o.mood(ans); }, 380);
    };
    self.free = function () { return !!actor && !hidden && !gn && !task; };
    // a short look at something (T3.creatureLook, the big-Goal observer)
    self.look = function (what, ms) { if (!actor) return; look.what = what || null; look.until = performance.now() + (ms > 0 ? ms : 1400); wake(); ctx.startLoop(); };
    self.enter = function (done) {
      var fired = false;
      function fin() { if (fired) return; fired = true; if (done) { try { done(); } catch (e) { console.warn(e); } } }
      if (!actor) { fin(); return; }
      if (task) finishTask(true);
      if (document.hidden) { endGesture(); setHidden(false); fin(); return; }
      startGesture('enter', 0, fin, performance.now()); setHidden(false);
    };
    self.exit = function (done) {
      var fired = false;
      function fin() { if (fired) return; fired = true; if (done) { try { done(); } catch (e) { console.warn(e); } } }
      if (!actor || hidden) { fin(); return; }
      if (task) finishTask(true);
      if (document.hidden) { endGesture(); setHidden(true); fin(); return; }
      startGesture('exit', 0, fin, performance.now());
    };
    self.visible = function () { return !!actor && !hidden; };
    self.talk = function (ms) {
      if (!actor || hidden) return;
      if (!(ms > 0)) { if (talk) talk.cut = performance.now(); return; }
      talk = { t0: performance.now(), dur: ms / 1000, cut: 0 }; wake(); ctx.dirty(); ctx.startLoop();
    };
    self.dances = function () { return actor ? actor.style.dances.slice() : []; };
    self.resetIdle = function () { wake(); };
    self.quiet = function () { return !actor || hidden || quiet; };

    // what the other creature needs to know
    self.baseX = function () { return base.x; };
    self.rootX = function () { return rp.x; };
    self.rootZ = function () { return rp.z; };
    self.scale = function () { return SCALE; };
    self.reaching = function () { return !!task && task.stage < 7 && (pose > 0.05 || Math.abs(off.x) > 0.3); };
    self.carried = function () { return task && task.picked && !task.released ? task.m : null; };
    self.talking = function () { return !!talk && !talk.cut; };
    self.head = function () { return headW; };
    self.gesturing = function () { return !!gn; };

    // ---------- reach / carry ----------
    self.move = function (id, zone, done) {
      var fired = false;
      function fin() { if (fired) return; fired = true; try { done(); } catch (e) { console.warn(e); } }
      var m = ctx.meshes[id], r = ctx.layout && ctx.layout.z[zone];
      if (!actor || hidden || !r || document.hidden || !m) { fin(); return; }
      if (gn === 'enter') endGesture();                              // get to the table first: the entrance gives way instantly
      var fromThink = gn === 'think' && !calmMode();                 // it was thinking: an "aha" beat first, then the reach
      if (gn && !fadeT0) fadeT0 = performance.now();                 // a reaction in progress eases out so the carry can start
      if (task) finishTask(true);                                  // a new move cuts off any return still in progress
      // the other creature lets go of this cube if it still has it (it never should: moves come one after the other)
      var o = crs[1 - idx]; if (o && o.carried() === m) o.abort();
      var now = performance.now(), ai = m.position.x < base.x ? 0 : 1, arm = actor.arms[ai], st = armSt[ai], sty = actor.style, s = sty.speed * (T3.creatureTempo || 1);
      var T = task = { id: id, m: m, zone: zone, fin: fin, ai: ai, arm: arm, st: st, stage: -1, t0: now, deadline: now + 12000 * (T3.creatureTempo || 1), picked: false, released: false, ended: false, hold: 0, nom: new THREE.Vector3(), R7: new THREE.Vector3(), fix: new THREE.Vector3(), err: 0 };
      T.S = st.goal.clone();
      T.cube = w2l(tmp.copy(m.position)).clone();
      T.G = T.cube.clone(); T.G.y += HOLD;
      T.H = T.cube.clone(); T.H.y += HOLD + 1.05;
      T.A = T.S.clone(); T.A.x += (T.A.x > 0 ? -0.15 : 0.15); T.A.y += 0.45; T.A.z -= 0.3;
      // drop point: the cube's slot in the zone, so it lands where it will stay instead of sliding there
      var sl = slotFor(id, zone), zx = sl.ok ? sl.x : r[0] + r[2] / 2, zz = sl.ok ? sl.z : r[1] + r[3] / 2 + 0.3;
      tmp2.set(zx, m.position.y + 0.4, zz); w2l(tmp2);
      T.Z = tmp2.clone(); T.Z.y += HOLD; T.R = T.Z.clone(); T.R.y += 0.5;
      T.zoneW = new THREE.Vector3(zx, 0.5, zz);
      T.yaw = cubeYaw(m);
      T.nom.copy(T.H);
      var d1 = T.A.distanceTo(T.H), d2 = T.G.distanceTo(T.R);
      T.arcH = clamp(0.5 + 0.05 * d1, 0.5, 1.5); T.apex = clamp(1.3 + 0.06 * d2, 1.3, 2.7);
      T.dur = [sty.anticipate, clamp(0.34 + 0.03 * d1, 0.4, 0.85), 0.2, 0.17, clamp(0.5 + 0.04 * d2, 0.6, 1.1), 0.22, 0.16, 0.6].map(function (x) { return x * s; });
      T.dur[0] = Math.max(T.dur[0], 0.28 * s);
      if (fromThink) { var ah = specFor(who, 'aha'); ahaT0 = now; ahaFired = 0; ahaDur = ah ? ah.dur : 0; T.dur[0] += Math.min(0.42, ahaDur * 0.45) * sty.moodScale; }
      else ahaT0 = 0;
      wake();
      T.align0 = st.align; T.open0 = st.open;
      T.timer = setTimeout(function () { if (task === T) finishTask(true); else if (!T.ended) { T.ended = true; releaseCube(T); T.fin(); } }, 13000 * (T3.creatureTempo || 1));
      stats.max = 0;
      setStage(T, 0, now);
      ctx.dirty(); ctx.startLoop();
    };
    self.stage = function () { return task ? task.stage : -1; };
    self.abort = function () { abortTask(); };
    // For short camera close-ups: the head's world position (follows steps, leans and entrances) and the creature's
    // standing height in world units. null when the creature is not at the table.
    self.focus = function () {
      if (!actor || hidden) return null;
      actor.root.updateMatrixWorld(true);
      var h = actor.headC.clone(); if (actor.headObj) actor.headObj.getWorldPosition(h); else h.applyMatrix4(actor.body.matrixWorld);
      return { head: h, height: actor.top * SCALE + ROOT_Y };
    };
    self.frameInfo = function () { return { scale: SCALE, rootY: ROOT_Y, front: FRONT, x: base.x, turn: seatTurn, fit: actor ? actor.fit || 1 : null }; };
    self.tune = function (o) {
      if (actor && o && typeof o.lean === 'number') actor.lean = o.lean;
      if (actor && o && o.fit) actor.fit = o.fit;
      if (actor && o && o.fitY != null) actor.fitY = o.fitY;
    };
    self.stats = function () { return { maxStretch: stats.max, offX: off.x, offZ: off.z, yieldX: yld.x, yieldZ: yld.z, pose: pose, gesture: gn, err: task ? task.err : 0, fixZ: task ? task.fix.z : 0, who: who, quiet: quiet, gm: lastGm, tgt: [tgt.x, tgt.y, tgt.z], head: [headW.x, headW.y, headW.z], headPitch: P.headPitch, headYaw: P.headYaw, lean: P.lean, open: P.open, eyeX: P.eyeX, eyeY: P.eyeY }; };
    function setStage(T, s, now) { T.stage = s; T.t0 = now; if (s === 6) releaseCube(T); }
    function releaseCube(T) {
      if (T.released) return; T.released = true;
      if (ctx.held === T.id) ctx.held = null;
      T.m.userData.dropped = true; T.fin();
    }
    function abortTask() { if (task) finishTask(true); }
    function finishTask(force) {
      var T = task; if (!T) return;
      clearTimeout(T.timer); T.ended = true; task = null;
      if (!T.released) { T.released = true; if (ctx.held === T.id) ctx.held = null; T.m.userData.dropped = true; T.fin(); }
      if (ctx.held === T.id) ctx.held = null;
    }
    // sets the hand's target (root-local) and its openness / alignment for the current stage. Stages 1..6 are anchored to the table, so
    // the creature's own step offsets (DD) are subtracted from them; T.nom keeps the target as if the creature stood at its usual spot.
    var OUT = new THREE.Vector3();
    function evalTask(T, now, dt) {
      var st = T.st, sty = actor.style, k, e, s = T.stage, d = T.dur[s], t = (now - T.t0) / 1000;
      k = d > 0 ? clamp(t / d, 0, 1) : 1;
      var open = st.open, align = st.align, yaw = st.yaw, lk = 0, dm = 1;
      switch (s) {
        case 0: e = easeIO(k); OUT.lerpVectors(T.S, T.A, e); open = lerp(T.open0, 0.75, e); align = lerp(T.align0, 0.7, e); lk = -0.07 * Math.sin(Math.PI * k); dm = 0; break;
        case 1: e = easeBack(k, sty.overshoot); OUT.lerpVectors(T.A, T.H, e); OUT.y += Math.sin(Math.PI * clamp(k, 0, 1)) * T.arcH; open = lerp(0.75, 1, easeOut(k)); align = lerp(0.7, 1, e > 1 ? 1 : e); yaw = T.yaw * sstep(k * 1.4); break;
        case 2: e = easeIO(k); OUT.lerpVectors(T.H, T.G, e); open = 1; align = 1; yaw = T.yaw; break;
        case 3: OUT.copy(T.G); OUT.y -= 0.05 * Math.sin(Math.PI * k); open = 1 - easeIO(k); align = 1; yaw = T.yaw; break;
        case 4: e = easeIO(k); tmp.copy(T.G).add(T.R).multiplyScalar(0.5); tmp.y += T.apex;
          OUT.copy(T.G).multiplyScalar((1 - e) * (1 - e)).addScaledVector(tmp, 2 * (1 - e) * e).addScaledVector(T.R, e * e);
          open = 0; align = 1; yaw = T.yaw; break;
        case 5: e = easeOut(k); OUT.lerpVectors(T.R, T.Z, e); open = 0; align = 1; yaw = T.yaw; break;
        case 6: OUT.copy(T.Z); open = easeIO(k); align = 1; yaw = T.yaw * (1 - k * 0.5); break;
        default:
          tmp.copy(T.Z); tmp.y += 0.75; tmp.z += 0.1; var rest = T.arm.rest;
          // first the hand lifts away from the cube's slot (still anchored to the table), then it eases home in the body's own frame
          if (k < 0.3) { OUT.lerpVectors(T.Z, tmp, easeOut(k / 0.3)); T.R7.copy(OUT).addScaledVector(DD, -1); }
          else { OUT.lerpVectors(T.R7, rest, easeIO((k - 0.3) / 0.7)); dm = 0; }
          open = lerp(1, 0.3, easeIO(k)); align = lerp(1, 0.55, easeIO(k)); yaw = T.yaw * (1 - k) * 0.5;
      }
      T.nom.copy(OUT);
      if (dm > 0) OUT.addScaledVector(DD, -dm);
      T.lean = lk;
      st.goal.copy(OUT); st.open = open; st.align = align; st.yaw = yaw;
      if (k >= 1) {
        // before grabbing (1-3) and before letting go (5): wait, briefly, until the hand is really there (the body may still be stepping)
        if ((s >= 1 && s <= 3 || s === 5) && T.err > 0.12 && now - T.t0 < (d + 1.8) * 1000) return;
        if (s === 3) { pickCube(T); }
        if (s === 7) { finishTask(false); return; }
        setStage(T, s + 1, now);
      }
    }
    function pickCube(T) {
      if (T.picked) return; T.picked = true; ctx.dropAnims(T.m); ctx.held = T.id; qBase.copy(T.m.quaternion);
      if (typeof Snd !== 'undefined' && Snd.pickup) Snd.pickup();
    }
    // glue the held die under the hand, with a little lag-swing
    function carryCube(T, dt) {
      var a = T.arm, st = T.st, v = tmp.copy(a.pos).applyMatrix4(actor.body.matrix); l2w(v);
      var vx = 0, vz = 0;
      if (st.pwOK && dt > 0) { vx = (v.x - st.pw.x) / dt; vz = (v.z - st.pw.z) / dt; }
      st.pw.copy(v); st.pwOK = true;
      var k = 1 - Math.exp(-12 * dt);
      tiltX += (clamp(vz * 0.04, -0.35, 0.35) - tiltX) * k; tiltZ += (clamp(-vx * 0.04, -0.35, 0.35) - tiltZ) * k;
      T.m.position.set(v.x, v.y - HOLD * SCALE, v.z);
      eul.set(tiltX, 0, tiltZ); qTilt.setFromEuler(eul); T.m.quaternion.copy(qBase).premultiply(qTilt);
    }
    // How the body helps a reach. The arm may only stretch ARM_STRETCH, so for a far cube the creature shuffles along the
    // table edge toward the cube's side, leans over the table and, if that is still not enough, steps forward over the
    // table (lifting itself so its tummy clears the felt). Everything eases back as the hand comes home.
    // Planned from the hand target as if the creature stood at its usual spot (T.nom), plus a correction (T.fix) that only
    // grows while the hand still falls short of its target, so a pick-up or a drop can never get stuck.
    // The shuffle keeps the creature's hips within sideLimit of the table's middle (or at its own seat, if that is further
    // out: the corner seat of a second creature), whichever seat it starts from.
    function posture(Tk, dt) {
      var t = 0, sx = 0, sz = 0, rel = 0;
      if (Tk && Tk.stage !== 7) {
        var N = Tk.stage <= 1 ? Tk.H : Tk.nom, S = Tk.arm.baseShoulder, lw = sideLimit();
        var lo = (Math.min(-lw, base.x) - base.x) / SCALE, hi = (Math.max(lw, base.x) - base.x) / SCALE;
        var R = armLen(Tk.arm) * Math.min(1.12, ARM_STRETCH * 0.9);    // a comfortable reach: barely stretched
        var dy = N.y - S.y, Rh = Math.sqrt(Math.max(R * R * 0.3, R * R - dy * dy));
        rel = N.x - S.x;
        var ar = Math.abs(rel), sg = rel < 0 ? -1 : 1;
        sx = sg * Math.max(0, ar - 1.6);
        if (ar - Math.abs(sx) > Rh * 0.8) sx = sg * (ar - Rh * 0.8);
        sx = clamp(sx + Tk.fix.x, lo, hi);
        var dx = rel - sx, need = (N.z - S.z) - Math.sqrt(Math.max(0, Rh * Rh - dx * dx));   // forward travel the shoulder still needs
        var LF = SLIDE_MAX + S.y * Math.sin(LEAN_MAX);                     // what a full lean gives
        t = clamp(need / LF, 0, 1); sz = Math.max(0, need - LF * t) + Tk.fix.z;
        rel = dx;
      }
      var k = 1 - Math.exp(-(Tk ? (Tk.stage === 7 ? 6 : 7) : 4) * dt), kz = 1 - Math.exp(-(Tk ? 5 : 4) * dt);
      pose += (t - pose) * k; off.x += (sx * SCALE - off.x) * k; off.z += (sz * SCALE - off.z) * kz;
      // making room: when the other creature comes past during its reach, this one steps back from the table and a little
      // aside (always away from the other one's seat, so it never dodges to and fro), then eases home
      var yx = 0, yz = 0, o = partner();
      if (!Tk && o && o.reaching()) {
        var gap = 1.75 * (SCALE + o.scale()), dxw = Math.abs(o.rootX() - (base.x + off.x)), near = o.rootZ() - base.z < 3.2;
        if (near && dxw < gap) {
          var f = sstep(1.25 * (1 - dxw / gap)), out = base.x < o.baseX() ? -1 : 1, W = ctx.layout ? ctx.layout.W : 18;
          yx = out * f * 0.5 * gap; yz = -f * 1.9 * SCALE / 2;
          var maxX = W / 2 + 1.2;                                         // stays by the table's end, in the picture
          if (Math.abs(base.x + yx) > maxX) yx = out * Math.max(0, maxX - Math.abs(base.x));
        }
      }
      var ky = 1 - Math.exp(-3 * dt);
      yld.x += (yx - yld.x) * ky; yld.z += (yz - yld.z) * ky;
      // a little footfall while it shuffles or steps
      var ox = off.x + yld.x, oz = off.z + yld.z, dx2 = ox - off.px, dz2 = oz - off.pz; off.px = ox; off.pz = oz;
      var dd = Math.sqrt(dx2 * dx2 + dz2 * dz2); off.ph += dd * 2.4;
      var sp = dt > 0 ? dd / dt : 0;
      if (sp > 0.4) { var g = Math.min(1, sp / 6); P.hop += 0.07 * g * Math.abs(Math.sin(off.ph * 3)); P.sway += 0.04 * g * Math.sin(off.ph * 3); P.turn += clamp(dx2 / Math.max(dt, 1e-3) * 0.04, -0.3, 0.3); }
      P.slide += pose * SLIDE_MAX; P.lean += pose * LEAN_MAX; P.rx += ox; P.rz += oz;
      // over the table: lift so the body clears the rim and the felt (in world units, converted to the root's offset)
      if (off.z > 0.01) P.ry += sstep(off.z / Math.max(0.5, FRONT)) * Math.max(0, LIFT_MAX - ROOT_Y);
      P.turn += clamp(rel * 0.03, -0.2, 0.2) * Math.min(1, pose * 2) * (Tk ? 1 : 0);
    }
    // after the arms are solved: how far the busy hand still is from where it was asked to be (root space, actor units),
    // and grow the step correction while it falls short (only during the reach, the carry and the drop)
    var ERRV = new THREE.Vector3();
    function trackReach(Tk, dt) {
      var a = Tk.arm, st = Tk.st;
      ERRV.copy(a.pos).applyMatrix4(actor.body.matrix).sub(st.goal).negate();
      Tk.err = ERRV.length();
      if (Tk.stage >= 1 && Tk.stage <= 6 && Tk.err > 0.06) {
        var r = Math.min(1, 2.5 * dt);
        Tk.fix.x = clamp(Tk.fix.x + ERRV.x * r, -6, 6); Tk.fix.z = clamp(Tk.fix.z + Math.max(0, ERRV.z) * r, 0, 12);
      }
    }

    // ---------- watching the table ----------
    function scanMovers(now, dt) {
      var n = 0, best = -1, bs = 3.5, M = ctx.meshes;
      for (var i = 0; i < 24; i++) {
        var m = M[i]; if (!m || !m.visible) continue;
        var p = m.position, j = i * 3;
        if (lastPosOK && dt > 0) {
          var dx = p.x - lastPos[j], dy = p.y - lastPos[j + 1], dz = p.z - lastPos[j + 2], sp = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
          if (sp > 2 && i !== ctx.held) { n++; if (sp > bs) { bs = sp; best = i; } }
        }
        lastPos[j] = p.x; lastPos[j + 1] = p.y; lastPos[j + 2] = p.z;
      }
      lastPosOK = true;
      if (n > 5) { mv.crowd = true; mv.id = -1; mv.until = now + 700; }
      else if (best >= 0) { mv.id = best; mv.crowd = false; mv.until = now + 650; }
      return now < mv.until;
    }

    // ---------- per-frame ----------
    // The pose is rebuilt every frame (rest + this creature's own posture + the current reaction + talking + the reach),
    // then compared with what was last drawn: only a real change asks for a frame. Once settled the creature is "quiet":
    // it then only checks, cheaply, whether something has happened that it should react to (nothing moves at rest).
    var SIG = new Float32Array(64), camQ = new THREE.Vector3();
    function lookTarget(mode, out, o) {
      var sg = gSide || 1;
      switch (mode) {
        // (the seat camera is just behind the kid: looking at him and at the camera are nearly the same, so the face stays readable)
        case 'kid': { var ps = T3.playerState ? T3.playerState() : null; out.copy(ctx.camera.position); if (ps && ps.visible && ps.pos) { tmpA.set(ps.pos[0], 2.8, ps.pos[1]); out.lerp(tmpA, 0.3); } return out; }
        case 'goal': { var r = ctx.layout && ctx.layout.z.goal; if (r) out.set(r[0] + r[2] / 2, 0.5, r[1] + r[3] / 2); else out.set(0, 0.5, 0); return out.lerp(ctx.camera.position, 0.35); }
        // looking at the table / down: aimed between the cubes and the camera, so the head dips a little and the face stays in view
        case 'table': return out.set(base.x * 0.4, 0.5, 1.0).lerp(ctx.camera.position, 0.45);
        case 'down': return out.set(headW.x, 0.5, headW.z + 8).lerp(ctx.camera.position, 0.3);
        case 'up': return out.set(headW.x - 3.5 * sg, headW.y + 4, headW.z + 5);
        case 'sky': return out.set(headW.x, headW.y + 9, headW.z + 3);
        case 'side': return out.set(headW.x + 5 * sg, headW.y + 0.3, headW.z + 3.5);
        case 'away': { var aw = o ? (o.rootX() > base.x ? -1 : 1) : sg; return out.set(headW.x + 6 * aw, headW.y + 0.8, headW.z + 2.5); }
        case 'partner': return o ? out.copy(o.head()) : out.copy(ctx.camera.position);
        default: return out.copy(ctx.camera.position);
      }
    }
    function signature(root) {
      var g = SIG, n = 0, keys = SIGKEYS;
      for (var k = 0; k < keys.length; k++) g[n++] = P[keys[k]] || 0;
      g[n++] = root.position.x; g[n++] = root.position.y; g[n++] = root.position.z; g[n++] = root.rotation.y; g[n++] = root.scale.x;
      for (var i = 0; i < 2; i++) { var st = armSt[i]; g[n++] = st.goal.x; g[n++] = st.goal.y; g[n++] = st.goal.z; g[n++] = st.open; g[n++] = st.align; g[n++] = st.yaw; }
      var d = 0; for (var j = 0; j < n; j++) { var x = Math.abs(g[j] - lastSig[j]); if (x > d) d = x; }
      return sigOK ? d : 1;
    }
    self.update = function (now) {
      if (!actor || hidden) { lastNow = now; return; }
      var moving = scanMovers(now, Math.min(0.1, (now - lastScan) / 1000)); lastScan = now;
      if (document.hidden && (task || gn)) { if (task) finishTask(true); if (gn) endGesture(); if (hidden) return; }
      var o = partner(), pCube = o ? o.carried() : null, pTalk = !!(o && o.talking());
      var settling = pose > 0.002 || Math.abs(off.x) > 0.002 || Math.abs(off.z) > 0.002 || Math.abs(yld.x) > 0.002 || Math.abs(yld.z) > 0.002;
      var busy = !!task || !!gn || !!talk || fx.live > 0 || settling || !!pCube || pTalk || !!(o && o.reaching()) || !!ahaT0 || now < look.until + 600 || now - blinkT0 < 400;
      if (quiet) {
        // settled: wake only for something that happened (a cube moving, a reaction, a line, the camera moving)
        // (every 1.5 s it looks once more anyway, without drawing unless something really changed: a safety net)
        if (!busy && !moving && camQ.distanceToSquared(ctx.camera.position) < 1e-6 && now - quietT < 1500) { lastNow = now; return; }
        wake();
      }
      var dt = clamp((now - lastNow) / 1000, 0.001, 0.05); lastNow = now; P.dt = dt;
      var sty = actor.style, i, a, st;

      // ----- reset the pose; this creature's own resting posture, then gestures add to it -----
      P.lean = BASE_LEAN + (actor.lean || 0); P.headYaw = 0; P.hop = 0; P.slide = 0; P.turn = seatTurn; P.sway = 0; P.headRoll = 0; P.lid = 0.9; P.lidAsym = 0; P.breathAmp = 1; P.breath = 0;
      P.browRaise = 0; P.browTilt = 0; P.browAsym = 0; P.smile = 0; P.open = 0; P.shrug = 0; P.happyAmt = 0; P.sadAmt = 0; P.cry = 0; P.cryT = 0; P.steam = 0; P.steamT = 0; P.angry = 0; P.pitchAdd = 0;
      P.rx = 0; P.ry = 0; P.rz = 0; P.rYaw = 0; P.rScale = 1; P.eyeWide = 0; P.pupil = 0; P.mouthW = 1; P.sweat = 0; P.sweatT = 0; P.gulp = 0; P.earL = 0; P.earR = 0; P.earUp = 0; P.hatTilt = 0; P.hatLift = 0;
      P.eyeAddX = 0; P.eyeAddY = 0; P.armRate = 9; P.gazeThink = 0; P.gazeSad = 0; P.gazeCam = 0; P.talk = 0; P.task = task ? task.ai + 1 : 0;
      P.glow = 0; P.tint = 0; P.eyeSplit = 0; P.lookMode = null; P.lookW = 0;
      if (restP) { P.lean += restP.lean || 0; P.pitchAdd += restP.pitch || 0; P.headRoll += restP.roll || 0; }
      for (i = 0; i < 2; i++) { a = actor.arms[i]; armSt[i].des.copy(a.rest); aAlign[i] = 0.55; aOpen[i] = 0.3; }
      // a blink: only when something asked for one (a big head turn, an arrival, a reaction)
      var bt = (now - blinkT0) / 1000, bc = sty.blink.c, bo = sty.blink.o;
      P.blink = bt < 0 ? 0 : bt < bc ? bt / bc : bt < bc + 0.03 ? 1 : bt < bc + 0.03 + bo ? 1 - (bt - bc - 0.03) / bo : 0;

      // ----- the current gesture (each plays once; 'think' is held) -----
      if (gn) {
        var gd = GEST[gn], u = (now - gT0) / 1000, fd = 1;
        if (fadeT0) { fd = 1 - sstep((now - fadeT0) / fadeTime); if (fd <= 0) { endGesture(); u = -1; } }
        if (u > gDur) { endGesture(); u = -1; }
        if (gn && u >= 0) {
          var rx0 = P.rx;
          C.u = u; C.un = u / gTempo; C.v = gv; C.side = gSide; C.sty = sty; C.kind = actor.styleKey || cur.kind; C.who = who; C.amp = sty.danceAmp; C.turns = sty.turns || 1;
          C.out = (ctx.layout ? ctx.layout.W / 2 : 9) + 6;
          C.e = (gd.raw || gd.own ? 1 : env(u, gDur, (gd.att || 0.3) * gTempo, gd.rel || 0.8)) * fd;
          gd.fn(C);
          // next to another creature, reactions sway less far sideways, so the two never bump
          if (!gd.raw && pairOn()) P.rx = rx0 + (P.rx - rx0) * 0.55;
        }
      }
      // ----- the "aha" beat right before a reach that follows a think -----
      if (ahaT0) {
        var au = (now - ahaT0) / 1000 / sty.moodScale, ah = specFor(who, 'aha');
        if (!ah || au > ahaDur) ahaT0 = 0;
        else { var gf = gFired; gFired = ahaFired; C.un = au; C.u = au; C.e = 1; C.v = 0; C.who = who; C.calm = false; perform(C, ah); ahaFired = gFired; gFired = gf; }
      }
      // ----- talking: the mouth follows the line (opens and closes in a speech rhythm) and stops when it ends; the head
      // tilts in once and holds while it speaks. Creatures without a mouth (the glTF monsters) nod a touch on the syllables.
      if (talk) {
        var tt = (now - talk.t0) / 1000, cf = talk.cut ? 1 - sstep((now - talk.cut) / 160) : 1;
        if (tt > talk.dur || cf <= 0) talk = null;
        else {
          var te = env(tt, talk.dur, 0.15, 0.3) * cf, wg = sstep((Math.sin(tt * TAU * 1.15 + 0.4) + 0.45) * 2.2), syl = 0.5 + 0.5 * Math.sin(tt * TAU * 4.3 + 0.8 * Math.sin(tt * 2.3));
          P.talk = te; P.talkT = tt;                                  // packs without a face use these
          P.open = Math.min(1, P.open + te * wg * (0.1 + 0.5 * syl * (0.65 + 0.35 * Math.sin(tt * 7.1))));
          P.headRoll += 0.06 * (idx ? -1 : 1) * te; P.browRaise += 0.15 * te;
          if (actor.mouthless) P.pitchAdd += 0.03 * te * wg * syl;
        }
      }

      // ----- body help for far reaches, and the root transform (steps, entrances) -----
      var Tk = task;
      if (Tk && now > Tk.deadline) { finishTask(true); Tk = null; }
      posture(Tk, dt);
      if (Tk && Tk.lean) P.lean += Tk.lean;
      var root = actor.root;
      root.position.set(base.x + P.rx, base.y + P.ry, base.z + P.rz); root.rotation.y = P.rYaw; root.scale.setScalar(SCALE * Math.max(0.001, P.rScale));
      rp.copy(root.position); headW.copy(actor.headC).multiplyScalar(SCALE).add(rp);
      DD.set(P.rx / SCALE, P.ry / SCALE, P.rz / SCALE);

      // ----- arms: free targets (rest + gestures), then the reach planner overrides the busy arm -----
      var kk = 1 - Math.exp(-P.armRate * dt);
      for (i = 0; i < 2; i++) {
        a = actor.arms[i]; st = armSt[i];
        if (!st.init) { st.goal.copy(a.rest); st.init = true; }
        if (Tk && Tk.ai === i) continue;
        st.goal.lerp(st.des, kk); st.align += (aAlign[i] - st.align) * kk; st.open += (aOpen[i] - st.open) * kk; st.yaw += (0 - st.yaw) * kk;
        if (st.goal.distanceToSquared(st.des) < 1e-8) st.goal.copy(st.des);
      }
      if (Tk) evalTask(Tk, now, dt);
      Tk = task;

      // ----- gaze: the eyes jump to what matters (one quick saccade), the head follows more slowly, then both are still -----
      var gm = 'cam';
      if (Tk) {
        var gs = Tk.stage; gm = (gs <= 3) ? 'cube' : (gs === 4 ? (clamp((now - Tk.t0) / 1000 / Tk.dur[4], 0, 1) < 0.55 ? 'die' : 'zone') : (gs === 5 || gs === 6) ? 'zone' : 'cam');
      } else if (pCube) gm = 'partnerCube';                         // the other creature is carrying a cube: watch it go
      else if (now < mv.until) gm = mv.crowd ? 'table' : 'mover';
      else if (now < look.until && look.what) gm = 'look';
      else if (pTalk) gm = 'partner';                              // the other creature is talking: look its way
      if (gm === 'cube') tgt.set(Tk.m.position.x, Tk.m.position.y + 0.3, Tk.m.position.z);
      else if (gm === 'die') tgt.copy(Tk.m.position);
      else if (gm === 'zone') tgt.copy(Tk.zoneW);
      else if (gm === 'partnerCube') tgt.copy(pCube.position);
      else if (gm === 'partner') tgt.copy(ctx.camera.position).lerp(o.head(), 0.7);
      else if (gm === 'mover') { var mm = ctx.meshes[mv.id]; if (mm) tgt.copy(mm.position); else tgt.copy(ctx.camera.position); }
      else if (gm === 'table') tgt.set(0, 0.5, 0.6);
      else if (gm === 'look') lookTarget(look.what, tgt, o);
      else tgt.copy(ctx.camera.position);
      // a reaction may ask to look somewhere (at the kid, down, away, at the other creature...) unless it is reaching
      lastGm = gm;
      if (P.lookW > 0 && P.lookMode && !Tk) { lookTarget(P.lookMode, tmp, o); tgt.lerp(tmp, P.lookW); }
      if (P.gazeCam) tgt.copy(ctx.camera.position);
      if (!gazeInit) { gaze.copy(tgt); gazeInit = true; }
      if (!eyeInit) { eyeG.copy(tgt); eyeInit = true; }
      // a big, sudden change of where to look carries a blink with it (as real eyes do on a big turn)
      tmp2.copy(eyeG).sub(headW); tmpA.copy(tgt).sub(headW);
      if (!Tk && tmp2.angleTo(tmpA) > 0.55) blink(now);
      eyeG.lerp(tgt, 1 - Math.exp(-26 * dt)); if (eyeG.distanceToSquared(tgt) < 1e-6) eyeG.copy(tgt);
      gaze.lerp(tgt, 1 - Math.exp(-sty.look * dt)); if (gaze.distanceToSquared(tgt) < 1e-6) gaze.copy(tgt);
      var dx = gaze.x - headW.x, dy = gaze.y - headW.y, dz = gaze.z - headW.z, hd = Math.sqrt(dx * dx + dz * dz) || 1e-3;
      // the head keeps looking at its target while the body turns (not during full spins)
      var tn = P.turn % TAU; if (tn > Math.PI) tn -= TAU; else if (tn < -Math.PI) tn += TAU;
      var comp = tn * (1 - sstep((Math.abs(tn) - 0.9) / 0.5));
      var yaw = Math.atan2(dx, dz) - comp, pitch = Math.atan2(-dy, hd);
      yaw = clamp(yaw, -1.1, 1.1);
      var hy = clamp(yaw * sty.headGain, -0.75, 0.75), hp = clamp(pitch * sty.headGain, actor.pitchMin != null ? actor.pitchMin : -0.55, 0.6);
      P.headYaw += hy; P.headPitch = hp - P.lean * (0.5 + 0.35 * pose) + P.pitchAdd;   // leaning far: keep the face up, eyes on the cube
      var ex = eyeG.x - headW.x, ey = eyeG.y - headW.y, ez = eyeG.z - headW.z, eh = Math.sqrt(ex * ex + ez * ez) || 1e-3;
      var yawE = clamp(Math.atan2(ex, ez) - comp, -1.4, 1.4), pitchE = Math.atan2(-ey, eh);
      P.eyeX = clamp((yawE - hy) / 0.55, -1, 1); P.eyeY = clamp(-(pitchE - hp + P.lean * 0.4) / 0.5, -1, 1);

      // ----- only a real change is drawn; a settled creature goes quiet -----
      var change = signature(root);
      if (change < 1.5e-4 && !Tk) {
        if (++quietFrames >= 6 && !busy && !moving) { quiet = true; quietT = now; camQ.copy(ctx.camera.position); }
        return;
      }
      quietFrames = 0; lastSig.set(SIG); sigOK = true;

      // ----- apply to the character -----
      actor.apply(P, now);
      for (i = 0; i < 2; i++) {
        a = actor.arms[i]; st = armSt[i]; a.open = st.open;
        tmp.copy(st.goal).applyMatrix4(actor.invBody);
        a.solve(tmp.x, tmp.y, tmp.z, st.align, st.yaw);
      }
      if (Tk) { trackReach(Tk, dt); if (Tk.arm.stretch > stats.max) stats.max = Tk.arm.stretch; if (Tk.picked && !Tk.released) carryCube(Tk, dt); }
      ctx.dirty();
    };

    // keep the creature in view when the camera fits the table (it may shuffle sideways along the table edge)
    self.place = place;
    self.extents = function (corners, W, D) {
      place();
      if (!actor) return;
      var top = actor.top * SCALE + ROOT_Y, z = -D / 2 - FRONT, x = Math.max(3.4, sideLimit() + 2.2, Math.abs(base.x) + 1.2);
      corners.push([-x, top, z], [x, top, z]);
      // it stands leaning back a little, so the top of its head is behind the hips: that point sits highest on screen
      corners.push([base.x, top + 0.1, z + (actor.headC.z - actor.top * Math.sin(-BASE_LEAN - (actor.lean || 0)) - 0.1) * SCALE, true]);   // true: this point must be on screen (the creatures shrink if it is not)
    };
    return self;
  }

  crs = [makeCreature(0), makeCreature(1)];
  function cr(i) { return crs[i == null ? use : (i ? 1 : 0)]; }

  // ---------- public API ----------
  // one creature: creature 0, the second one (if any) leaves
  T3.setCreature = function (kind, packId) {
    use = 0;
    if (crs[1].has()) crs[1].set(null);
    crs[0].set(kind, packId);
    ctx.refit();
  };
  T3.setCreature2 = function (kind, packId) {
    crs[1].set(kind, packId);
    if (!kind && use === 1) use = 0;
    ctx.refit();
  };
  T3.setCreatures = function (list) {
    list = (list || []).filter(Boolean);
    use = 0;
    if (list.length < 2 && crs[1].has()) crs[1].set(null);
    crs[0].set(list[0] ? list[0].kind : null, list[0] && list[0].pack);
    if (list.length >= 2) crs[1].set(list[1].kind, list[1].pack);
    ctx.refit();
  };
  T3.creatureUse = function (i) { if (i === undefined) return use; use = i ? 1 : 0; return use; };
  // runs fn() with creature i in use, then puts the previous one back (e.g. a mood for the creature that is not up)
  T3.creatureWith = function (i, fn) { var u = use; use = i ? 1 : 0; try { return fn(); } finally { use = u; } };
  T3.creatureCount = function () { return (crs[0].has() ? 1 : 0) + (crs[1].has() ? 1 : 0); };
  T3.creatureDances = function () { return cr().dances(); };
  T3.creatureMood = function (m, opts) { cr().mood(m, opts); };
  T3.creatureEnter = function (done) { cr().enter(done); };
  T3.creatureExit = function (done) { cr().exit(done); };
  T3.creatureVisible = function (i) { return cr(i).visible(); };
  T3.creatureTalk = function (ms) { cr().talk(ms); };
  T3.creatureIdleFlair = function () { return false; };     // idle flairs are gone: nothing moves at rest (kept so old callers do not break)
  T3.creatureLook = function (what, ms) { cr().look(what, ms); };
  T3.creatureQuiet = function (i) { return cr(i).quiet(); };
  T3.creatureMove = function (id, zone, done) { cr().move(id, zone, done); };
  T3.creatureStage = function (i) { return cr(i).stage(); };   // debugging: 0 anticipate .. 7 return, -1 idle
  T3.creatureFocus = function (i) { return cr(i).focus(); };
  T3._creatureActor = function (i) { return cr(i).actor(); };   // debugging / tests only
  // Tuning hook (no effect unless called): T3.creatureFrame('wide', {topH, min, max, rootY, front, handX}) then it refits. No argument: the current values.
  T3.creatureFrame = function (layout, o) {
    var c = cr();
    if (!layout) { var fi = c.frameInfo(); return { layout: ctx.layoutName, frame: JSON.parse(JSON.stringify(FRAME)), pair: JSON.parse(JSON.stringify(PAIR)), scale: fi.scale, rootY: fi.rootY, front: fi.front, x: fi.x, fit: fi.fit }; }
    if (FRAME[layout] && o) ['topH', 'min', 'max', 'rootY', 'front', 'handX'].forEach(function (k) { if (typeof o[k] === 'number') FRAME[layout][k] = o[k]; });
    if (PAIR[layout] && o && o.pair) ['s', 'x', 'turn', 'handX'].forEach(function (k) { if (o.pair[k] != null) PAIR[layout][k] = o.pair[k]; });
    c.tune(o);
    crs.forEach(function (x) { x.place(); }); ctx.refit(); ctx.dirty(); ctx.startLoop();
  };
  T3.creatureStats = function (i) { return cr(i).stats(); };

  // Watching the game without any hook in game.js: when the kid sets the Goal, the creatures look at it; a huge Goal
  // (50 or more, or four cubes and more) earns an 'impressed' reaction from each free creature (the second a beat later).
  var seenGoal = null;
  function watchGoal() {
    var Gm = (typeof G !== 'undefined') ? G : null;
    if (!Gm || !Gm.players) { seenGoal = null; return; }
    var key = Gm.goal != null && Gm.goalTokens && Gm.goalTokens.length ? Gm.shake + ':' + Gm.goal + ':' + Gm.goalTokens.length : null;
    if (key === seenGoal) return;
    var was = seenGoal; seenGoal = key;
    if (!key || was === undefined) return;
    var setter = Gm.players[Gm.setter]; if (!setter || setter.ai || Gm.phase === 'goal') return;
    var cubes = 0; for (var i = 0; i < Gm.goalTokens.length; i++) if (typeof Gm.goalTokens[i] === 'object') cubes++;
    var big = Math.abs(Gm.goal) >= 50 || cubes >= 4;
    crs.forEach(function (c, k) {
      if (!c.free()) return;
      if (big) setTimeout(function () { if (c.free()) c.mood('impressed'); }, 250 + k * 450);
      else c.look('goal', 1300);
    });
  }
  var lastFx = 0;
  ctx.hooks.frame.push(function (now) {
    try { watchGoal(); } catch (e) { /* the game state is not ours: never let it break the frame */ }
    crs[0].update(now); crs[1].update(now);
    var dt = clamp((now - lastFx) / 1000, 0.001, 0.05); lastFx = now;
    if (fx.live) { fxUpdate(now, dt); ctx.dirty(); }
  });
  // both creatures shrink together if the heads do not fit
  if (ctx.hooks.shrink) ctx.hooks.shrink.push(function (s) { squeeze = s; });
  ctx.hooks.extents.push(function (corners, W, D) { crs[0].extents(corners, W, D); crs[1].extents(corners, W, D); });
})();
