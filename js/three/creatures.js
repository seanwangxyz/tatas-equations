// Creature opponents across the table. Plugs into the 3D table through T3.ctx (see js/three/table.js).
//
//   T3.setCreature(kind|null, packId?)   kinds: sloth penguin fox owl wizard pip
//   T3.creatureMood(name|null)   one-shot reactions, see T3.creatureMoods(): think happy sad challenge dance cry tantrum gloat
//   T3.creatureMoods() -> array of supported mood names (unknown names are ignored; null eases back to rest)
//   T3.creatureMove(cubeId, zoneName, done)   reach, grab, carry, soft release; done() fires exactly once
//   T3.creaturePacks() -> [{id, name, available}]
//   T3.creatureTempo = 1   (multiplies the duration of reaches; >1 slows them down, handy for inspecting poses)
//
// This file is the runtime (placement, gaze, moods, reach/carry planner). Characters come from packs:
//   creatures/classic.js  code-built animals (always available)
//   creatures/gltfpack.js glTF monsters driven by assets/creatures/monsters/manifest.json (see assets/creatures/README.md)
import * as THREE from 'three';
import { clamp, lerp, sstep, easeIO, easeBack, easeOut } from './creatures/common.js';
import { buildClassic, HOLD, restPos } from './creatures/classic.js';
import { MonstersPack } from './creatures/gltfpack.js';

var T3 = window.T3;
if (T3 && T3.ctx) (function () {
  var ctx = T3.ctx;
  var SCALE = 1.3, ROOT_Y = 0.22, FRONT = 1.95, BASE_LEAN = -0.13;

  // ---------- packs ----------
  var packs = {
    classic: { id: 'classic', name: 'Classic', available: true, has: function () { return true; }, ready: function () { return true; }, build: function (k) { return buildClassic(k); } },
    monsters: MonstersPack
  };
  T3.creaturePacks = function () { return Object.keys(packs).map(function (id) { var p = packs[id]; return { id: id, name: p.name, available: !!p.available }; }); };
  T3.creaturePacksReady = MonstersPack.probe(ctx);

  // ---------- state ----------
  var actor = null, cur = { kind: null, pack: 'classic' };
  var rp = new THREE.Vector3(), headW = new THREE.Vector3(), lastNow = 0, lastScan = 0, lastUpdate = 0, serial = 0;
  var P = { breath: 0, lean: 0, hop: 0, slide: 0, turn: 0, sway: 0, headYaw: 0, headPitch: 0, headRoll: 0, eyeX: 0, eyeY: 0, lid: 0.9, blink: 0, lidAsym: 0, browRaise: 0, browTilt: 0, browAsym: 0, smile: 0, open: 0, shrug: 0, happyAmt: 0, sadAmt: 0, dt: 0.016 };
  var mood = null, moodT0 = 0, moodDur = 0;
  var task = null;
  var nextBlink = 0, blinkT0 = -1e9;
  var leanSm = 0;
  var mv = { id: -1, until: 0, crowd: false }, lastPos = new Float32Array(24 * 3), lastPosOK = false;
  var gaze = new THREE.Vector3(), gazeInit = false, tgt = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  var armSt = [mkArm(), mkArm()];
  function mkArm() { return { goal: new THREE.Vector3(), des: new THREE.Vector3(), align: 0.55, open: 0.3, yaw: 0, init: false, wrist: new THREE.Vector3(), pw: new THREE.Vector3(), pwOK: false }; }
  var qBase = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), eul = new THREE.Euler();
  var tiltX = 0, tiltZ = 0;

  var MOODS = { think: 2.8, happy: 2.1, sad: 2.6, challenge: 1.9, dance: 3.0, cry: 2.5, tantrum: 2.5, gloat: 2.0 };
  var fadeT0 = 0, WIPE = new THREE.Vector3(0.5, 2.3, 1.3), CHEST = new THREE.Vector3(0.3, 1.0, 1.2), POINT = new THREE.Vector3(1.0, 2.3, 2.7);
  T3.creatureMoods = function () { return Object.keys(MOODS); };
  var CHIN = new THREE.Vector3(0.42, 1.78, 1.25), CHEER = new THREE.Vector3(1.95, 3.55, 0.7), CHAL = new THREE.Vector3(1.35, 3.3, 1.75);

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function env(u, dur, att, rel) { if (u < 0 || u > dur) return 0; return sstep(u / att) * (1 - sstep((u - (dur - rel)) / rel)); }
  function w2l(v) { v.x = (v.x - rp.x) / SCALE; v.y = (v.y - rp.y) / SCALE; v.z = (v.z - rp.z) / SCALE; return v; }
  function l2w(v) { v.x = v.x * SCALE + rp.x; v.y = v.y * SCALE + rp.y; v.z = v.z * SCALE + rp.z; return v; }

  // ---------- placement ----------
  function placeCreature() {
    if (!actor || !ctx.layout) return;
    var D = ctx.layout.D;
    actor.root.position.set(0, ROOT_Y, -D / 2 - FRONT); actor.root.scale.setScalar(SCALE); actor.root.updateMatrixWorld(true);
    rp.copy(actor.root.position);
    headW.copy(actor.headC).multiplyScalar(SCALE).add(rp);
    for (var i = 0; i < 2; i++) { var a = actor.arms[i]; armSt[i].init = false; a.rest = a.rest || restPos(a.side); }
  }

  // ---------- public API ----------
  function resolvePack(packId) {
    var id = packId || (typeof S !== 'undefined' && S && S.cos && S.cos.pack) || 'classic';
    return (packs[id] && packs[id].available) ? id : 'classic';
  }
  function clearActor() {
    if (!actor) return;
    abortTask();
    ctx.scene.remove(actor.root); if (actor.dispose) actor.dispose();
    actor.root.traverse(function (o) { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } });
    actor = null;
  }
  function install(a, kind, packId) {
    clearActor(); actor = a; cur = { kind: kind, pack: packId };
    ctx.scene.add(a.root); gazeInit = false; lastPosOK = false; mood = null; leanSm = 0; tiltX = tiltZ = 0;
    nextBlink = performance.now() + 1200; placeCreature(); ctx.refit(); ctx.dirty(); ctx.startLoop();
  }
  T3.setCreature = function (kind, packId) {
    var my = ++serial;
    if (!kind) { clearActor(); cur = { kind: null, pack: 'classic' }; ctx.refit(); return; }
    var pid = resolvePack(packId), pk = packs[pid];
    if (pid !== 'classic' && !pk.has(kind)) pid = 'classic';
    try {
      if (pid !== 'classic' && !packs[pid].ready(kind)) {
        // model still loading: show the classic stand-in now, swap when the model arrives and the creature is idle
        install(buildClassic(kind), kind, 'classic');
        packs[pid].load(kind, ctx).then(function () {
          if (my !== serial) return;
          (function swap() { if (my !== serial) return; if (task) { setTimeout(swap, 400); return; } try { install(packs[pid].build(kind), kind, pid); } catch (e) { console.warn('creature swap failed', e); } })();
        }).catch(function (e) { console.warn('creature model failed to load', e); });
        return;
      }
      install(pid === 'classic' ? buildClassic(kind) : packs[pid].build(kind), kind, pid);
    } catch (e) { console.warn('creature build failed, using classic', e); try { install(buildClassic(kind), kind, 'classic'); } catch (e2) { console.warn(e2); } }
  };
  T3.creatureMood = function (m) {
    if (!actor) return;
    var now = performance.now();
    if (m && !MOODS[m]) return;                                  // unknown names are ignored
    if (!m) { if (mood) fadeT0 = now; return; }                  // null: ease back to rest
    mood = m; moodT0 = now; fadeT0 = 0; moodDur = MOODS[mood] * actor.style.moodScale;
    if (actor.playMood) actor.playMood(mood);
    ctx.dirty(); ctx.startLoop();
  };

  // ---------- reach / carry ----------
  T3.creatureMove = function (id, zone, done) {
    var fired = false;
    function fin() { if (fired) return; fired = true; try { done(); } catch (e) { console.warn(e); } }
    var m = ctx.meshes[id], r = ctx.layout && ctx.layout.z[zone];
    if (!actor || !r || document.hidden || !m) { fin(); return; }
    if (mood && !fadeT0) fadeT0 = performance.now();               // a reaction in progress eases out so the carry can start
    if (task) finishTask(true);                                  // a new move cuts off any return still in progress
    var now = performance.now(), ai = m.position.x < 0 ? 0 : 1, arm = actor.arms[ai], st = armSt[ai], sty = actor.style, s = sty.speed * (T3.creatureTempo || 1);
    var T = task = { id: id, m: m, zone: zone, fin: fin, ai: ai, arm: arm, st: st, stage: -1, t0: now, deadline: now + 9000 * (T3.creatureTempo || 1), picked: false, released: false, ended: false, hold: 0 };
    T.S = st.goal.clone();
    T.cube = w2l(tmp.copy(m.position)).clone();
    T.G = T.cube.clone(); T.G.y += HOLD;
    T.H = T.cube.clone(); T.H.y += HOLD + 1.05;
    T.A = T.S.clone(); T.A.x += (T.A.x > 0 ? -0.15 : 0.15); T.A.y += 0.45; T.A.z -= 0.3;
    tmp2.set(r[0] + r[2] / 2, m.position.y + 0.4, r[1] + r[3] / 2 + 0.3); w2l(tmp2);
    T.Z = tmp2.clone(); T.Z.y += HOLD; T.R = T.Z.clone(); T.R.y += 0.5;
    T.zoneW = new THREE.Vector3(r[0] + r[2] / 2, 0.5, r[1] + r[3] / 2 + 0.3);
    T.yaw = cubeYaw(m);
    var d1 = T.A.distanceTo(T.H), d2 = T.G.distanceTo(T.R);
    T.arcH = clamp(0.5 + 0.05 * d1, 0.5, 1.5); T.apex = clamp(1.3 + 0.06 * d2, 1.3, 2.7);
    T.dur = [sty.anticipate, clamp(0.34 + 0.03 * d1, 0.4, 0.85), 0.2, 0.17, clamp(0.5 + 0.04 * d2, 0.6, 1.1), 0.22, 0.16, 0.6].map(function (x) { return x * s; });
    T.align0 = st.align; T.open0 = st.open;
    T.timer = setTimeout(function () { if (task === T) finishTask(true); else if (!T.ended) { T.ended = true; releaseCube(T); T.fin(); } }, 10000 * (T3.creatureTempo || 1));
    setStage(T, 0, now);
    ctx.dirty(); ctx.startLoop();
  };
  T3.creatureStage = function () { return task ? task.stage : -1; };   // debugging: 0 anticipate .. 7 return, -1 idle
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
  // sets T.out (root-local wrist target) and the hand's openness / alignment for the current stage
  var OUT = new THREE.Vector3();
  function evalTask(T, now, dt) {
    var st = T.st, sty = actor.style, k, e, s = T.stage, d = T.dur[s], t = (now - T.t0) / 1000;
    k = d > 0 ? clamp(t / d, 0, 1) : 1;
    var open = st.open, align = st.align, yaw = st.yaw, lk = 0;
    switch (s) {
      case 0: e = easeIO(k); OUT.lerpVectors(T.S, T.A, e); open = lerp(T.open0, 0.75, e); align = lerp(T.align0, 0.7, e); lk = -0.07 * Math.sin(Math.PI * k); break;
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
        if (k < 0.3) OUT.lerpVectors(T.Z, tmp, easeOut(k / 0.3)); else OUT.lerpVectors(tmp, rest, easeIO((k - 0.3) / 0.7));
        open = lerp(1, 0.3, easeIO(k)); align = lerp(1, 0.55, easeIO(k)); yaw = T.yaw * (1 - k) * 0.5;
    }
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
    if (!actor) { lastNow = now; return; }
    var busy = !!task || (mood && true), moving = scanMovers(now, Math.min(0.1, (now - lastScan) / 1000)); lastScan = now;
    if (!busy && !moving && now - lastUpdate < 32) return;       // idle (breathing/blinking only): ~30 fps is plenty
    var dt = clamp((now - lastNow) / 1000, 0.001, 0.05); lastNow = now; lastUpdate = now; P.dt = dt;
    var sty = actor.style, u = (now - moodT0) / 1000;
    if (document.hidden && task) finishTask(true);

    // mood envelope
    var e = 0, eT = 0, eH = 0, eS = 0, eC = 0, eD = 0, eCr = 0, eTa = 0, eG = 0, un = u / sty.moodScale;
    if (mood) {
      var fd = 1; if (fadeT0) { fd = 1 - sstep((now - fadeT0) / 450); if (fd <= 0) { mood = null; fadeT0 = 0; } }
      if (mood && u > moodDur) mood = null;
      if (mood) {
        e = env(u, moodDur, 0.3 * sty.moodScale, 0.8) * fd;
        switch (mood) { case 'think': eT = e; break; case 'happy': eH = e; break; case 'sad': eS = e; break; case 'challenge': eC = e; break; case 'dance': eD = e; break; case 'cry': eCr = e; break; case 'tantrum': eTa = e; break; case 'gloat': eG = e; break; }
      }
    }
    var eSad = Math.max(eS, eCr);

    // ----- base pose -----
    P.breath = Math.sin(now / 1000 * Math.PI * 2 / sty.breath) * (1 + 2.2 * eS * (u < 1.4 ? 1 : 0));
    P.lean = BASE_LEAN; P.headYaw = 0; P.hop = 0; P.slide = 0; P.turn = 0; P.sway = 0; P.headRoll = 0; P.lid = 0.9; P.lidAsym = 0;
    P.browRaise = 0; P.browTilt = 0; P.browAsym = 0; P.smile = 0; P.open = 0; P.shrug = 0; P.happyAmt = eH; P.sadAmt = eS; P.cry = 0; P.cryT = u; P.steam = 0; P.steamT = u; P.angry = 0; P.pitchAdd = 0;
    // blinks
    if (now >= nextBlink) { blinkT0 = now; nextBlink = now + rnd(sty.blink.g[0], sty.blink.g[1]) * 1000; }
    var bt = (now - blinkT0) / 1000, bc = sty.blink.c, bo = sty.blink.o;
    P.blink = bt < 0 ? 0 : bt < bc ? bt / bc : bt < bc + 0.03 ? 1 : bt < bc + 0.03 + bo ? 1 - (bt - bc - 0.03) / bo : 0;

    // ----- mood contributions (each plays once) -----
    if (eT > 0) { P.headRoll += 0.17 * eT; P.browAsym += 0.8 * eT; P.browTilt -= 0.1 * eT; P.smile -= 0.15 * eT; P.lean += 0.04 * eT; P.lid -= 0.05 * eT; }
    if (eH > 0) {
      P.browRaise += 0.55 * eH; P.lid -= 0.3 * eH; P.smile += 1.0 * eH; P.open += 0.85 * eH; P.shrug += 0.3 * eH; P.headRoll += 0.05 * Math.sin(u * 3) * eH;
      P.hop += 0.16 * Math.sin(Math.PI * clamp(u / 0.5, 0, 1)); P.lean += 0.04 * eH;
    }
    if (eS > 0) {
      P.browTilt -= 1.0 * eS; P.browRaise += 0.15 * eS; P.smile -= 0.9 * eS; P.lid -= 0.12 * eS; P.lean += 0.17 * eS; P.shrug -= 0.5 * eS;
      P.headYaw += 0.2 * Math.sin(u * 5.2) * eS * (u < 1.3 ? 1 : 0);
    }
    if (eC > 0) {
      P.browTilt += 1.0 * eC; P.browRaise -= 0.1 * eC; P.open += 0.9 * eC; P.smile += 0.1 * eC; P.lean += 0.14 * eC; P.lid += 0.05 * eC;
      P.hop += 0.1 * Math.sin(Math.PI * clamp(u / 0.35, 0, 1));
    }
    var spinA = 0;
    if (eD > 0) {
      var amp = sty.danceAmp, beat = un * 8.8;
      P.browRaise += 0.5 * eD; P.lid -= 0.25 * eD; P.smile += eD; P.open += 0.7 * eD;
      P.sway += 0.13 * amp * Math.sin(beat) * eD; P.hop += 0.07 * amp * Math.abs(Math.sin(beat)) * eD; P.shrug += 0.2 * eD;
      if (sty.turns) { spinA = sstep((un - 0.9) / (sty.turns > 1 ? 0.8 : 1.0)) * Math.PI * 2 * sty.turns; P.turn += spinA; }
    }
    if (eCr > 0) {
      var sn = Math.max(0, Math.sin((un - 1.1) * 9)) * (un > 1.1 && un < 1.45 ? 1 : 0) + Math.max(0, Math.sin((un - 1.6) * 9)) * (un > 1.6 && un < 1.95 ? 1 : 0);
      P.browTilt -= 1.1 * eCr; P.browRaise += 0.2 * eCr; P.smile += -0.9 * eCr + 0.15 * Math.sin(u * 18) * eCr; P.lid -= 0.25 * eCr; P.lean += 0.17 * eCr;
      P.shrug += 0.5 * sn * eCr - 0.3 * eCr; P.headYaw += 0.12 * Math.sin(u * 3.4) * eCr; P.cry = eCr; P.cryT = u;
    }
    if (eTa > 0) {
      var tw = sstep((un - 0.3) / 0.2) * (1 - sstep((un - 1.9) / 0.3)), tb = un * 13.8;
      P.browTilt += 1.2 * eTa; P.browRaise -= 0.2 * eTa; P.open += 0.9 * eTa; P.smile -= 0.3 * eTa; P.lean += 0.12 * eTa; P.lid += 0.05 * eTa;
      P.headYaw += 0.3 * Math.sin(un * 22) * tw; P.sway += 0.05 * Math.sin(tb) * tw; P.hop += 0.09 * Math.max(0, Math.sin(tb)) * tw;
      P.angry = eTa; P.steam = eTa; P.steamT = u;
    }
    if (eG > 0) {
      var lw = sstep((un - 0.9) / 0.2) * (1 - sstep((un - 1.7) / 0.2)), lh = Math.abs(Math.sin(un * 10));
      P.lean -= 0.1 * eG; P.lid -= 0.28 * eG; P.browAsym += 0.9 * eG; P.smile += 0.75 * eG; P.headRoll += 0.08 * eG; P.pitchAdd = -0.3 * eG;
      P.open += (0.15 + 0.5 * lh) * lw * eG; P.shrug += 0.35 * lh * lw * eG;
    }
    if (task && task.lean) P.lean += task.lean;

    // ----- arms: free targets (rest + gestures), then the reach planner overrides the busy arm -----
    var i, a, st, rest, tmpw;
    for (i = 0; i < 2; i++) {
      a = actor.arms[i]; st = armSt[i]; rest = a.rest;
      if (!st.init) { st.goal.copy(rest); st.init = true; }
      if (task && task.ai === i) continue;
      st.des.copy(rest); var tAlign = 0.55, tOpen = 0.3, ys = a.side;
      if (eSad > 0) { st.des.x -= ys * 0.28 * eSad; st.des.y -= 0.3 * eSad; st.des.z -= 0.55 * eSad; }
      if (eCr > 0 && i === 1) { var ww = sstep((un - 1.0) / 0.3) * (1 - sstep((un - 2.0) / 0.3)); tmp.set(WIPE.x + Math.sin(u * 16) * 0.1, WIPE.y, WIPE.z); st.des.lerp(tmp, ww); tAlign = lerp(tAlign, 0.3, ww); }
      if (eD > 0) {
        var bt2 = un * 8.8, ay = 3.0 + 0.8 * sty.danceAmp * Math.sin(bt2 + i * Math.PI);
        tmp.set(ys * 1.75, ay, 0.8);
        if (spinA > 0) { var sp1 = Math.sin(Math.PI * clamp(spinA / (Math.PI * 2 * sty.turns), 0, 1)); tmp.lerp(tmp2.set(ys * 3.0, 1.9, 0.3), sp1); }
        var ca = Math.cos(P.turn), sa = Math.sin(P.turn), tx = tmp.x * ca + tmp.z * sa, tz = -tmp.x * sa + tmp.z * ca; tmp.x = tx; tmp.z = tz;
        st.des.lerp(tmp, eD); tAlign = lerp(tAlign, 0.2, eD); tOpen = lerp(tOpen, 1, eD);
      }
      if (eTa > 0) {
        var tb2 = un * 13.8, pw = sstep((un - 0.3) / 0.2) * (1 - sstep((un - 1.9) / 0.3));
        tmp.set(ys * 1.5, 0.25 + 1.9 * (0.5 + 0.5 * Math.sin(tb2 + i * Math.PI)), 1.3);
        st.des.lerp(tmp, pw * eTa); tAlign = lerp(tAlign, 0.4, eTa); tOpen = lerp(tOpen, 0, eTa);
      }
      if (eG > 0) {
        if (i === 0) { var w0 = env(un, 1.1, 0.25, 0.25) * eG, ct = un * 9; tmp.set(-CHEST.x + Math.cos(ct) * 0.12, CHEST.y + Math.sin(ct) * 0.1, CHEST.z); st.des.lerp(tmp, w0); tAlign = lerp(tAlign, 0.3, w0); }
        else { var w1 = env(un - 0.9, 1.0, 0.25, 0.3) * eG; st.des.lerp(POINT, w1); tAlign = lerp(tAlign, 0.2, w1); tOpen = lerp(tOpen, 0.1, w1); }
      }
      if (eT > 0 && i === 1) { st.des.lerp(CHIN, eT); tAlign = lerp(tAlign, 0.35, eT); }
      if (eH > 0) { tmp.set(ys * CHEER.x, CHEER.y, CHEER.z); st.des.lerp(tmp, eH); tAlign = lerp(tAlign, 0.2, eH); tOpen = lerp(tOpen, 1, eH); }
      if (eC > 0 && i === 1) { st.des.lerp(CHAL, eC); tAlign = lerp(tAlign, 0.2, eC); tOpen = lerp(tOpen, 1, eC); }
      var kk = 1 - Math.exp(-9 * dt);
      st.goal.lerp(st.des, kk); st.align += (tAlign - st.align) * kk; st.open += (tOpen - st.open) * kk; st.yaw += (0 - st.yaw) * kk;
    }
    if (task) { if (now > task.deadline) finishTask(true); else evalTask(task, now, dt); }
    var Tk = task;

    // lean toward far reaches
    var need = 0;
    if (Tk) { a = Tk.arm; need = clamp((Math.sqrt(Tk.st.goal.x * Tk.st.goal.x + (Tk.st.goal.z * Tk.st.goal.z) + Math.pow(Tk.st.goal.y - 1.4, 2)) - 2.3) / 7, 0, 1); }
    leanSm += (need - leanSm) * (1 - Math.exp(-6 * dt));
    P.slide += leanSm * 1.6; P.lean += leanSm * 0.26;
    if (Tk) P.turn += clamp(Tk.st.goal.x * 0.025, -0.2, 0.2) * leanSm;

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
    if (eT > 0) { tmp.set(headW.x - 4, headW.y + 4, headW.z + 5); tgt.lerp(tmp, eT); }
    if (eSad > 0) { tmp.set(headW.x, headW.y - 3, headW.z + 5); tgt.lerp(tmp, eSad * 0.9); }
    if (eH > 0 || eC > 0 || eD > 0 || eTa > 0 || eG > 0) tgt.copy(ctx.camera.position);
    if (!gazeInit) { gaze.copy(tgt); gazeInit = true; }
    gaze.lerp(tgt, 1 - Math.exp(-sty.look * dt));
    var dx = gaze.x - headW.x, dy = gaze.y - headW.y, dz = gaze.z - headW.z, hd = Math.sqrt(dx * dx + dz * dz) || 1e-3;
    var yaw = Math.atan2(dx, dz), pitch = Math.atan2(-dy, hd);
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
    if (Tk && Tk.picked && !Tk.released) carryCube(Tk, dt);
    ctx.dirty();
  }

  ctx.hooks.frame.push(update);
  // keep the creature in view when the camera fits the table
  ctx.hooks.extents.push(function (corners, W, D) {
    placeCreature();
    if (actor) { var top = actor.top * SCALE + ROOT_Y, z = -D / 2 - FRONT; corners.push([-3.4, top, z], [3.4, top, z]); }
  });
})();
