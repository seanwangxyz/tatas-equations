// Creature opponents across the table. Plugs into the 3D table through T3.ctx (see js/three/table.js).
//
//   T3.setCreature(kind|null, packId?)   kinds: sloth penguin fox owl wizard pip
//   T3.creatureEnter(done?) / T3.creatureExit(done?)   arrive at / leave the table with a greeting or a goodbye; done fires once
//   T3.creatureMood(name|null, {variant}?)   one-shot reactions, see T3.creatureMoods(); `dance` has 3 variants per creature
//   T3.creatureMoods() -> array of supported mood names (unknown names are ignored; null eases back to rest)
//   T3.creatureTalk(ms)   the mouth moves (with small head gestures) for about ms, then closes; a mood interrupts it
//   T3.creatureIdleFlair(on?)   rare, subtle in-character idle one-shots (default on); with no argument returns the setting
//   T3.creatureMove(cubeId, zoneName, done)   reach, grab, carry, soft release; done() fires exactly once
//   T3.creaturePacks() -> [{id, name, available}]
//   T3.creatureTempo = 1   (multiplies the duration of reaches; >1 slows them down, handy for inspecting poses)
//
// This file is the runtime (placement, gaze, gestures, reach/carry planner). Characters come from packs:
//   creatures/classic.js  code-built animals (always available)
//   creatures/gltfpack.js glTF monsters driven by assets/creatures/monsters/manifest.json (see assets/creatures/README.md);
//                         monsterrig.js drives their skeleton (IK arms, spine, head) from the same pose struct P and hand targets
//                         the classic creatures use, monsterwear.js builds their jersey / scarf / armband
// The one-shot gestures themselves (moods, dances, entrances, flairs) live in creatures/gestures.js.
// Style rule: at rest a creature only breathes and blinks. Everything else here is a one-shot that returns to rest.
import * as THREE from 'three';
import { clamp, lerp, sstep, easeIO, easeBack, easeOut } from './creatures/common.js';
import { buildClassic, HOLD, restPos } from './creatures/classic.js';
import { MonstersPack } from './creatures/gltfpack.js';
import { GEST, MOOD_NAMES } from './creatures/gestures.js';

var T3 = window.T3;
if (T3 && T3.ctx) (function () {
  var ctx = T3.ctx;
  var SCALE = 1.3, ROOT_Y = 0.22, FRONT = 1.95, BASE_LEAN = -0.13, TAU = Math.PI * 2;
  var ZSTEP = 4.6;           // world units the creature may step forward over the table edge for a far reach
  var LEAN_MAX = 0.6, SLIDE_MAX = 1.1;

  // ---------- packs ----------
  var packs = {
    classic: { id: 'classic', name: 'Classic', available: true, has: function () { return true; }, ready: function () { return true; }, build: function (k) { return buildClassic(k); } },
    monsters: MonstersPack
  };
  T3.creaturePacks = function () { return Object.keys(packs).map(function (id) { var p = packs[id]; return { id: id, name: p.name, available: !!p.available }; }); };
  T3.creaturePacksReady = MonstersPack.probe(ctx);

  // ---------- state ----------
  var actor = null, cur = { kind: null, pack: 'classic' }, hidden = false;
  var base = new THREE.Vector3(), rp = new THREE.Vector3(), headW = new THREE.Vector3(), lastNow = 0, lastScan = 0, lastUpdate = 0, serial = 0;
  var P = { breath: 0, breathAmp: 1, lean: 0, hop: 0, slide: 0, turn: 0, sway: 0, headYaw: 0, headPitch: 0, headRoll: 0, eyeX: 0, eyeY: 0, eyeAddX: 0, eyeAddY: 0, lid: 0.9, blink: 0, lidAsym: 0,
    browRaise: 0, browTilt: 0, browAsym: 0, smile: 0, open: 0, shrug: 0, happyAmt: 0, sadAmt: 0, dt: 0.016,
    rx: 0, ry: 0, rz: 0, rYaw: 0, rScale: 1, eyeWide: 0, pupil: 0, mouthW: 1, sweat: 0, sweatT: 0, gulp: 0, earL: 0, earR: 0, earUp: 0, hatTilt: 0, hatLift: 0, armRate: 9,
    gazeThink: 0, gazeSad: 0, gazeCam: 0, cry: 0, cryT: 0, steam: 0, steamT: 0, angry: 0, pitchAdd: 0, tailLift: 0, beardSway: 0, talk: 0, talkT: 0, task: 0 };
  var task = null;
  var nextBlink = 0, blinkT0 = -1e9;
  var pose = 0;                                                  // 0..1 how far the body leans/slides/steps for a far reach
  var off = { x: 0, z: 0, px: 0, ph: 0 };                        // smoothed world-space step offsets while reaching
  var idleSince = 0, nextFlair = 0, flairOn = true;
  var talk = null, lastDance = {};
  var mv = { id: -1, until: 0, crowd: false }, lastPos = new Float32Array(24 * 3), lastPosOK = false;
  var gaze = new THREE.Vector3(), gazeInit = false, tgt = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpA = new THREE.Vector3(), DD = new THREE.Vector3();
  var armSt = [mkArm(), mkArm()], aAlign = [0.55, 0.55], aOpen = [0.3, 0.3];
  function mkArm() { return { goal: new THREE.Vector3(), des: new THREE.Vector3(), align: 0.55, open: 0.3, yaw: 0, init: false, wrist: new THREE.Vector3(), pw: new THREE.Vector3(), pwOK: false }; }
  var qBase = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), eul = new THREE.Euler();
  var tiltX = 0, tiltZ = 0;

  // current gesture (a mood, dance, entrance/exit or idle flair): only one at a time
  var gn = null, gv = 0, gT0 = 0, gDur = 0, gTempo = 1, gDone = null, gFired = 0, gSide = 1, gTimer = 0, fadeT0 = 0, pendingMood = null;
  var C = { P: P, u: 0, un: 0, e: 0, sty: null, kind: '', v: 0, side: 1, out: 15, amp: 1, turns: 1, rest: [null, null], arm: null, fx: null, once: null };

  T3.creatureMoods = function () { return MOOD_NAMES.slice(); };
  T3.creatureDances = function () { return actor ? actor.style.dances.slice() : []; };
  var fadeTime = 450;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function env(u, dur, att, rel) { if (u < 0 || u > dur) return 0; return sstep(u / att) * (1 - sstep((u - (dur - rel)) / rel)); }
  // world <-> creature space. Nominal = relative to where the creature normally stands (ignores its current step offsets).
  function w2l(v) { v.x = (v.x - base.x) / SCALE; v.y = (v.y - base.y) / SCALE; v.z = (v.z - base.z) / SCALE; return v; }
  function l2w(v) { v.x = v.x * SCALE + rp.x; v.y = v.y * SCALE + rp.y; v.z = v.z * SCALE + rp.z; return v; }
  function sideLimit() { var W = ctx.layout ? ctx.layout.W : 18; return Math.min(W / 2 - 2.2, 6.5); }

  // the helpers the gestures use
  C.arm = function (i, x, y, z, w, al, op) {
    if (!(w > 0)) return; if (w > 1) w = 1;
    var ca = Math.cos(P.turn), sa = Math.sin(P.turn);
    tmpA.set(x * ca + z * sa, y, -x * sa + z * ca); armSt[i].des.lerp(tmpA, w);
    aAlign[i] += (al - aAlign[i]) * w; aOpen[i] += (op - aOpen[i]) * w;
  };
  C.once = function (bit, cond) { if (cond && !(gFired & bit)) { gFired |= bit; return true; } return false; };
  C.fx = function (n, h) { fxBurst(n, h); };

  // ---------- star sparkles (wizard magic) ----------
  var fx = { sprites: null, live: 0, tex: null };
  function starTexture() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,250,200,.9)'); gr.addColorStop(1, 'rgba(255,230,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffe066'; g.strokeStyle = '#fff6c2'; g.lineWidth = 2; g.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 17; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fill(); g.stroke();
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function fxBurst(n, h) {
    if (document.hidden) return;
    if (!fx.sprites) {
      fx.tex = starTexture(); fx.sprites = [];
      for (var i = 0; i < 24; i++) { var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); s.visible = false; s.renderOrder = 5; ctx.scene.add(s); s.userData = { life: 0, t0: 0 }; fx.sprites.push(s); }
    }
    var made = 0;
    for (var j = 0; j < fx.sprites.length && made < n; j++) {
      var sp = fx.sprites[j], u = sp.userData; if (sp.visible) continue;
      var a = rnd(0, TAU), r = rnd(0.2, 0.9), up = rnd(0.5, 1.7);
      u.t0 = performance.now(); u.life = rnd(700, 1200); u.vx = Math.cos(a) * r * 3; u.vy = up * 2.2; u.vz = Math.sin(a) * r * 2 + 1; u.size = rnd(0.35, 0.7); u.spin = rnd(-3, 3);
      sp.position.set(rp.x + Math.cos(a) * 0.3, rp.y + h * SCALE, rp.z + 1.0); sp.visible = true; sp.scale.setScalar(0.01); sp.material.opacity = 1; sp.material.rotation = rnd(0, 3); made++; fx.live++;
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

  // ---------- placement ----------
  function placeCreature() {
    if (!actor || !ctx.layout) return;
    var D = ctx.layout.D;
    base.set(0, ROOT_Y, -D / 2 - FRONT);
    actor.root.position.copy(base); actor.root.scale.setScalar(SCALE); actor.root.updateMatrixWorld(true);
    rp.copy(base);
    headW.copy(actor.headC).multiplyScalar(SCALE).add(rp);
    for (var i = 0; i < 2; i++) { var a = actor.arms[i]; armSt[i].init = false; a.rest = a.rest || restPos(a.side); C.rest[i] = a.rest; }
  }

  // ---------- public API ----------
  function resolvePack(packId) {
    var id = packId || (typeof S !== 'undefined' && S && S.cos && S.cos.pack) || 'classic';
    return (packs[id] && packs[id].available) ? id : 'classic';
  }
  function clearActor() {
    if (!actor) return;
    abortTask(); endGesture(); talk = null; pendingMood = null;
    ctx.scene.remove(actor.root); if (actor.dispose) actor.dispose();
    actor.root.traverse(function (o) { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } });
    actor = null;
  }
  function install(a, kind, packId) {
    clearActor(); actor = a; cur = { kind: kind, pack: packId };
    ctx.scene.add(a.root); gazeInit = false; lastPosOK = false; gn = null; leanReset(); hidden = false; a.root.visible = true; C.sty = a.style; C.kind = a.styleKey || kind;
    nextBlink = performance.now() + 1200; idleSince = 0; placeCreature(); ctx.refit(); ctx.dirty(); ctx.startLoop();
  }
  function leanReset() { tiltX = tiltZ = 0; pose = 0; off.x = off.z = 0; }
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
  T3.setCreature = function (kind, packId) {
    var my = ++serial;
    if (!kind) { clearActor(); cur = { kind: null, pack: 'classic' }; ctx.refit(); return; }
    var want = packId || (typeof S !== 'undefined' && S && S.cos && S.cos.pack) || 'classic';
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

  // ----- gestures -----
  function setHidden(h) { hidden = h; if (actor) actor.root.visible = !h; ctx.dirty(); }
  function startGesture(n, v, done, now) {
    endGesture();
    var d = GEST[n], sty = actor.style;
    gn = n; gv = v | 0; gT0 = now; gFired = 0; fadeT0 = 0; gDone = done || null; gSide = Math.random() < 0.5 ? -1 : 1;
    gTempo = n === 'dance' ? clamp(sty.moodScale, 0.85, 1.15) : sty.moodScale;
    gDur = d.abs ? d.dur(actor.styleKey || cur.kind) : d.dur * gTempo;
    if (n !== 'flair' && talk && !talk.cut) talk.cut = now;                  // a reaction interrupts talking
    if (!d.raw && n !== 'flair' && actor.playMood) actor.playMood(n);
    if (gDone) { var my = ++gTimerSerial; gTimer = setTimeout(function () { if (gn && my === gTimerSerial) endGesture(); }, gDur * 1000 + 1500); }
    ctx.dirty(); ctx.startLoop();
  }
  var gTimerSerial = 0;
  function endGesture() {
    clearTimeout(gTimer); gTimerSerial++;
    var d = gDone, n = gn, pm = pendingMood; gDone = null; gn = null; fadeT0 = 0; pendingMood = null;
    if (n === 'exit') setHidden(true);
    if (d) { try { d(); } catch (e) { console.warn(e); } }
    if (n === 'enter' && pm && actor && !gn && !hidden) T3.creatureMood(pm.m, pm.o);
  }
  T3.creatureMood = function (m, opts) {
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
  };
  T3.creatureEnter = function (done) {
    var fired = false;
    function fin() { if (fired) return; fired = true; if (done) { try { done(); } catch (e) { console.warn(e); } } }
    if (!actor) { fin(); return; }
    if (task) finishTask(true);
    if (document.hidden) { endGesture(); setHidden(false); fin(); return; }
    startGesture('enter', 0, fin, performance.now()); setHidden(false);
  };
  T3.creatureExit = function (done) {
    var fired = false;
    function fin() { if (fired) return; fired = true; if (done) { try { done(); } catch (e) { console.warn(e); } } }
    if (!actor || hidden) { fin(); return; }
    if (task) finishTask(true);
    if (document.hidden) { endGesture(); setHidden(true); fin(); return; }
    startGesture('exit', 0, fin, performance.now());
  };
  T3.creatureVisible = function () { return !!actor && !hidden; };
  T3.creatureTalk = function (ms) {
    if (!actor || hidden) return;
    if (!(ms > 0)) { if (talk) talk.cut = performance.now(); return; }
    talk = { t0: performance.now(), dur: ms / 1000, cut: 0 }; ctx.dirty(); ctx.startLoop();
  };
  T3.creatureIdleFlair = function (on) { if (on === undefined) return flairOn; flairOn = !!on; idleSince = 0; return flairOn; };

  // ---------- reach / carry ----------
  // Where a cube will come to rest in a zone (mirrors the slot layout in table.js; an approximation is fine).
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
  T3.creatureMove = function (id, zone, done) {
    var fired = false;
    function fin() { if (fired) return; fired = true; try { done(); } catch (e) { console.warn(e); } }
    var m = ctx.meshes[id], r = ctx.layout && ctx.layout.z[zone];
    if (!actor || hidden || !r || document.hidden || !m) { fin(); return; }
    if (gn === 'enter') endGesture();                              // get to the table first: the entrance gives way instantly
    if (gn && !fadeT0) fadeT0 = performance.now();                 // a reaction in progress eases out so the carry can start
    if (task) finishTask(true);                                  // a new move cuts off any return still in progress
    var now = performance.now(), ai = m.position.x < 0 ? 0 : 1, arm = actor.arms[ai], st = armSt[ai], sty = actor.style, s = sty.speed * (T3.creatureTempo || 1);
    var T = task = { id: id, m: m, zone: zone, fin: fin, ai: ai, arm: arm, st: st, stage: -1, t0: now, deadline: now + 9000 * (T3.creatureTempo || 1), picked: false, released: false, ended: false, hold: 0, nom: new THREE.Vector3(), R7: new THREE.Vector3() };
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
    T.align0 = st.align; T.open0 = st.open;
    T.timer = setTimeout(function () { if (task === T) finishTask(true); else if (!T.ended) { T.ended = true; releaseCube(T); T.fin(); } }, 10000 * (T3.creatureTempo || 1));
    stats.max = 0;
    setStage(T, 0, now);
    ctx.dirty(); ctx.startLoop();
  };
  var stats = { max: 0 };
  T3.creatureStage = function () { return task ? task.stage : -1; };   // debugging: 0 anticipate .. 7 return, -1 idle
  T3.creatureStats = function () { return { maxStretch: stats.max, offX: off.x, offZ: off.z, pose: pose, gesture: gn }; };
  function cubeYaw(m) {
    var q = m.quaternion, vx = 1 - 2 * (q.y * q.y + q.z * q.z), vz = 2 * (q.x * q.z - q.w * q.y);
    var yw = Math.atan2(-vz, vx), q4 = Math.PI / 2; yw = yw - Math.round(yw / q4) * q4; return clamp(yw, -0.8, 0.8);
  }
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
  // How the body helps a reach: step along the table edge toward the cube's side, lean and slide over the table, step forward a little.
  // Driven by the hand target as if the creature stood at its usual spot, so it eases back as the cube comes home.
  function posture(Tk, dt) {
    var t = 0, sx = 0, rel = 0;
    if (Tk && Tk.stage !== 7) {
      var N = Tk.stage <= 1 ? Tk.H : Tk.nom, shx = Tk.arm.baseShoulder.x, lim = sideLimit() / SCALE;
      rel = N.x - shx; sx = clamp(Math.sign(rel) * Math.max(0, Math.abs(rel) - 1.6), -lim, lim);
      var dz = N.z - 0.02, rx = rel - sx; t = clamp((Math.sqrt(rx * rx + dz * dz) - 2.8) / 7.2, 0, 1);
      rel = rx;
    }
    var k = 1 - Math.exp(-(Tk ? (Tk.stage === 7 ? 9 : 10) : 5) * dt);
    pose += (t - pose) * k; off.x += (sx * SCALE - off.x) * k; off.z += (t * ZSTEP - off.z) * k;
    // a little footfall while it shuffles sideways
    var dx = off.x - off.px; off.px = off.x; off.ph += Math.abs(dx) * 2.4;
    var sp = dt > 0 ? Math.abs(dx) / dt : 0;
    if (sp > 0.4) { var g = Math.min(1, sp / 6); P.hop += 0.07 * g * Math.abs(Math.sin(off.ph * 3)); P.sway += 0.04 * g * Math.sin(off.ph * 3); P.turn += clamp(dx / Math.max(dt, 1e-3) * 0.04, -0.3, 0.3); }
    P.slide += pose * SLIDE_MAX; P.lean += pose * LEAN_MAX; P.rx += off.x; P.rz += off.z;
    P.turn += clamp(rel * 0.03, -0.2, 0.2) * Math.min(1, pose * 2) * (Tk ? 1 : 0);
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
  function update(now) {
    if (!actor || hidden) { lastNow = now; return; }
    var moving = scanMovers(now, Math.min(0.1, (now - lastScan) / 1000)); lastScan = now;
    if (document.hidden && (task || gn)) { if (task) finishTask(true); if (gn) endGesture(); if (hidden) return; }
    var settling = pose > 0.002 || Math.abs(off.x) > 0.002 || Math.abs(off.z) > 0.002;
    var busy = !!task || !!gn || !!talk || fx.live > 0 || settling;
    // a rare idle flair, only when nothing else has happened for a while
    if (busy) idleSince = 0;
    else {
      if (!idleSince) { idleSince = now; nextFlair = now + rnd(25000, 45000); }
      if (flairOn && now >= nextFlair) { if (!moving && !document.hidden) { startGesture('flair', 0, null, now); busy = true; } else nextFlair = now + 3000; }
    }
    if (!busy && !moving && now - lastUpdate < 32) return;       // idle (breathing/blinking only): ~30 fps is plenty
    var dt = clamp((now - lastNow) / 1000, 0.001, 0.05); lastNow = now; lastUpdate = now; P.dt = dt;
    var sty = actor.style, i, a, st, rest;

    // ----- reset the pose; gestures then add to it -----
    P.lean = BASE_LEAN; P.headYaw = 0; P.hop = 0; P.slide = 0; P.turn = 0; P.sway = 0; P.headRoll = 0; P.lid = 0.9; P.lidAsym = 0; P.breathAmp = 1;
    P.browRaise = 0; P.browTilt = 0; P.browAsym = 0; P.smile = 0; P.open = 0; P.shrug = 0; P.happyAmt = 0; P.sadAmt = 0; P.cry = 0; P.cryT = 0; P.steam = 0; P.steamT = 0; P.angry = 0; P.pitchAdd = 0;
    P.rx = 0; P.ry = 0; P.rz = 0; P.rYaw = 0; P.rScale = 1; P.eyeWide = 0; P.pupil = 0; P.mouthW = 1; P.sweat = 0; P.gulp = 0; P.earL = 0; P.earR = 0; P.earUp = 0; P.hatTilt = 0; P.hatLift = 0;
    P.eyeAddX = 0; P.eyeAddY = 0; P.armRate = 9; P.gazeThink = 0; P.gazeSad = 0; P.gazeCam = 0; P.talk = 0; P.task = task ? task.ai + 1 : 0;
    for (i = 0; i < 2; i++) { a = actor.arms[i]; armSt[i].des.copy(a.rest); aAlign[i] = 0.55; aOpen[i] = 0.3; }
    // blinks
    if (now >= nextBlink) { blinkT0 = now; nextBlink = now + rnd(sty.blink.g[0], sty.blink.g[1]) * 1000; }
    var bt = (now - blinkT0) / 1000, bc = sty.blink.c, bo = sty.blink.o;
    P.blink = bt < 0 ? 0 : bt < bc ? bt / bc : bt < bc + 0.03 ? 1 : bt < bc + 0.03 + bo ? 1 - (bt - bc - 0.03) / bo : 0;

    // ----- the current gesture (each plays once) -----
    if (gn) {
      var gd = GEST[gn], u = (now - gT0) / 1000, fd = 1;
      if (fadeT0) { fd = 1 - sstep((now - fadeT0) / fadeTime); if (fd <= 0) { endGesture(); u = -1; } }
      if (u > gDur) { endGesture(); u = -1; }
      if (gn && u >= 0) {
        C.u = u; C.un = u / gTempo; C.v = gv; C.side = gSide; C.sty = sty; C.kind = actor.styleKey || cur.kind; C.amp = sty.danceAmp; C.turns = sty.turns || 1; C.out = (ctx.layout ? ctx.layout.W / 2 : 9) + 6;
        C.e = (gd.raw ? 1 : env(u, gDur, (gd.att || 0.3) * gTempo, gd.rel || 0.8)) * fd;
        gd.fn(C);
      }
    }
    P.breath = Math.sin(now / 1000 * Math.PI * 2 / sty.breath) * P.breathAmp;
    // ----- talking: the mouth opens and closes in a natural rhythm, with small head gestures, on top of the current expression -----
    if (talk) {
      var tt = (now - talk.t0) / 1000, cf = talk.cut ? 1 - sstep((now - talk.cut) / 160) : 1;
      if (tt > talk.dur || cf <= 0) talk = null;
      else {
        var te = env(tt, talk.dur, 0.15, 0.3) * cf, wg = sstep((Math.sin(tt * TAU * 1.15 + 0.4) + 0.45) * 2.2), syl = 0.5 + 0.5 * Math.sin(tt * TAU * 4.3 + 0.8 * Math.sin(tt * 2.3));
        P.talk = te; P.talkT = tt;                                  // packs without a face use these for head bobs and hand gestures
        P.open = Math.min(1, P.open + te * wg * (0.1 + 0.5 * syl * (0.65 + 0.35 * Math.sin(tt * 7.1))));
        P.pitchAdd += 0.05 * Math.sin(tt * TAU * 1.15 + 1) * te * wg; P.headYaw += 0.07 * Math.sin(tt * TAU * 0.7) * te; P.browRaise += 0.22 * te * wg * Math.max(0, Math.sin(tt * TAU * 1.15 + 2.6));
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
    }
    if (Tk) evalTask(Tk, now, dt);
    Tk = task;

    // ----- gaze -----
    var gm = 'cam';
    if (Tk) {
      var gs = Tk.stage; gm = (gs <= 3) ? 'cube' : (gs === 4 ? (clamp((now - Tk.t0) / 1000 / Tk.dur[4], 0, 1) < 0.55 ? 'die' : 'zone') : (gs === 5 || gs === 6) ? 'zone' : 'cam');
    } else if (now < mv.until) gm = mv.crowd ? 'table' : 'mover';
    if (gm === 'cube') tgt.set(Tk.m.position.x, Tk.m.position.y + 0.3, Tk.m.position.z);
    else if (gm === 'die') tgt.copy(Tk.m.position);
    else if (gm === 'zone') tgt.copy(Tk.zoneW);
    else if (gm === 'mover') { var mm = ctx.meshes[mv.id]; if (mm) tgt.copy(mm.position); else tgt.copy(ctx.camera.position); }
    else if (gm === 'table') tgt.set(0, 0.5, 0.6);
    else tgt.copy(ctx.camera.position);
    if (P.gazeThink > 0) { tmp.set(headW.x - 4, headW.y + 4, headW.z + 5); tgt.lerp(tmp, P.gazeThink); }
    if (P.gazeSad > 0) { tmp.set(headW.x, headW.y - 3, headW.z + 5); tgt.lerp(tmp, P.gazeSad); }
    if (P.gazeCam) tgt.copy(ctx.camera.position);
    if (!gazeInit) { gaze.copy(tgt); gazeInit = true; }
    gaze.lerp(tgt, 1 - Math.exp(-sty.look * dt));
    var dx = gaze.x - headW.x, dy = gaze.y - headW.y, dz = gaze.z - headW.z, hd = Math.sqrt(dx * dx + dz * dz) || 1e-3;
    // the head keeps looking at its target while the body turns (not during full spins)
    var tn = P.turn % TAU; if (tn > Math.PI) tn -= TAU; else if (tn < -Math.PI) tn += TAU;
    var comp = tn * (1 - sstep((Math.abs(tn) - 0.9) / 0.5));
    var yaw = Math.atan2(dx, dz) - comp, pitch = Math.atan2(-dy, hd);
    yaw = clamp(yaw, -1.1, 1.1);
    var hy = clamp(yaw * sty.headGain, -0.75, 0.75), hp = clamp(pitch * sty.headGain, -0.55, 0.6);
    P.headYaw += hy; P.headPitch = hp - P.lean * 0.5 + P.pitchAdd;
    P.eyeX = clamp((yaw - hy) / 0.55, -1, 1); P.eyeY = clamp(-(pitch - hp + P.lean * 0.4) / 0.5, -1, 1);

    // ----- apply to the character -----
    actor.apply(P, now);
    for (i = 0; i < 2; i++) {
      a = actor.arms[i]; st = armSt[i]; a.open = st.open;
      tmp.copy(st.goal).applyMatrix4(actor.invBody);
      a.solve(tmp.x, tmp.y, tmp.z, st.align, st.yaw);
    }
    if (Tk) { if (Tk.arm.stretch > stats.max) stats.max = Tk.arm.stretch; if (Tk.picked && !Tk.released) carryCube(Tk, dt); }
    fxUpdate(now, dt);
    ctx.dirty();
  }

  ctx.hooks.frame.push(update);
  // keep the creature in view when the camera fits the table (it may shuffle sideways along the table edge)
  ctx.hooks.extents.push(function (corners, W, D) {
    placeCreature();
    if (actor) { var top = actor.top * SCALE + ROOT_Y, z = -D / 2 - FRONT, x = Math.max(3.4, sideLimit() + 2.2); corners.push([-x, top, z], [x, top, z]); }
  });
})();
