'use strict';
// ======================= TITLE SOUNDS (Web Audio, synthesized; no audio files) =======================
// The title screen's own sounds: a short original fanfare, cube thuds synced to the landings, floodlights coming up,
// a whoosh and a sparkle for the title, a crowd swell, little hops and pats, soft UI sounds, and a very low stadium
// ambience while the title rests. It plays on the game's shared context (Snd.context(), js/sound.js): the opening
// through Snd.bus('sfx'), the resting murmur through Snd.bus('amb'), the button sounds through Snd.bus('ui'), so Mute,
// the volumes and the shared limiter apply and one tap unlocks everything. (Without js/sound.js it makes its own
// context after the first tap, honouring S.set.mute / S.set.sfx.) No melody loops here: the game's own menu music (if
// S.set.music is on) is started by ui.js once the opening is over. Every voice has a level trim from the offline
// audit (docs/handoff/sound.md): the fanfare peaks about -17 LUFS, the little hops and pats about -34.
//
//   TitleSfx.unlock()            call from a tap (creates / resumes the context)
//   TitleSfx.begin()             starts a new "score": the times given to play() count from here
//   TitleSfx.play(name, t, o, now)  schedule a sound t seconds after begin() (now: t counts from this moment instead)
//   TitleSfx.cancel()            the opening was skipped: everything scheduled fades out at once
//   TitleSfx.ambience(on)        the quiet stadium bed under the resting title
//   TitleSfx.ui('hover'|'press'|'step', v)   soft UI sounds
//   TitleSfx.stopAll()           leaving the title: everything stops, the context is suspended
//   TitleSfx.stats() / _render(score, seconds) checks: live nodes; an offline render of a score (peak, RMS, clipping)
//   TitleSfx._into(c, dests, score)  schedules a score into any context (the offline audit, inside Snd._measure)
var TitleSfx = (function () {
  var ac = null, own = false, G = null, base = 0, score = [], liveSrc = 0, created = 0, ambOn = false, suspendT = 0;
  var AMB = 0.034;   // the resting murmur, about -45 LUFS like the match ambience
  var TRIM = { fanfare: 0.53, thud: 1.1, tick: 2.55, lightsUp: 0.77, liftoff: 1.15, whoosh: 1.47, sparkle: 0.78, chime: 0.68, crowd: 1.77, confetti: 1.39, boing: 1.82, pat: 1.74, hi: 1.8, clack: 2.15, twinkle: 0.85 };
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function vol(k, d) { var v = setg()[k]; return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : d; }
  function sharedOK() { return typeof Snd !== 'undefined' && Snd && typeof Snd.bus === 'function' && typeof Snd.context === 'function'; }
  // shared: the buses apply the volume, so the title's own master stays at the level its sounds were made for
  function level() { if (!own && sharedOK()) return Snd.level('sfx') > 0 ? 0.8 : 0; return setg().mute ? 0 : vol('sfx', 0.8) * 0.8; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------------------------------------------------------------- the graph (also built inside an OfflineAudioContext)
  // dests: { sfx, amb, ui } nodes to end in (the shared buses), or nothing for c.destination
  function graph(c, live, dests) {
    var g = { c: c, live: live, srcs: [], dests: dests || null };
    g.master = c.createGain(); g.master.gain.value = live ? level() : (dests ? 0.8 : 0.64);
    var comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 10; comp.attack.value = 0.003; comp.release.value = 0.25;
    var ceil = c.createGain(); ceil.gain.value = 0.9;
    g.master.connect(comp); comp.connect(ceil); ceil.connect(dests ? dests.sfx : c.destination);
    // a small generated room (the stadium is open: short and bright)
    var sr = c.sampleRate, len = Math.floor(sr * 1.4), ir = c.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch), lp = 0; for (var k = 0; k < len; k++) { var t = k / len; lp += ((Math.random() * 2 - 1) - lp) * (0.5 + 0.4 * t); d[k] = lp * Math.pow(1 - t, 3) * 1.6; } }
    g.conv = c.createConvolver(); g.conv.buffer = ir; g.rev = c.createGain(); g.rev.gain.value = 0.5; g.rev.connect(g.conv); g.conv.connect(g.master);
    g.intro = c.createGain(); g.intro.connect(g.master);        // the opening (cancel() fades this one)
    g.amb = c.createGain(); g.amb.gain.value = 0;
    g.ui = c.createGain(); g.ui.gain.value = 5;   // audited: the hover tick and the press were far below the game's clicks
    if (dests) { var am = c.createGain(); am.gain.value = 0.8; g.amb.connect(am); am.connect(dests.amb); var um = c.createGain(); um.gain.value = 0.8; g.ui.connect(um); um.connect(dests.ui); }
    else { g.amb.connect(g.master); g.ui.connect(g.master); }
    // noise sources
    var nb = c.createBuffer(1, sr * 2, sr), nd = nb.getChannelData(0); for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    var pb = c.createBuffer(1, sr * 4, sr), pd = pb.getChannelData(0), b0 = 0, b1 = 0, b2 = 0, pk = 0;
    for (var m = 0; m < pd.length; m++) { var w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; pd[m] = b0 + b1 + b2 + w * 0.1848; if (Math.abs(pd[m]) > pk) pk = Math.abs(pd[m]); }
    for (var q = 0; q < pd.length; q++) pd[q] /= pk;
    var xf = Math.floor(sr * 0.1); for (var z = 0; z < xf; z++) { var f = z / xf; pd[z] = pd[z] * f + pd[pd.length - xf + z] * (1 - f); }
    g.noise = nb; g.pink = pb;
    return g;
  }
  function track(g, src, nodes) {
    if (g.live) { liveSrc++; created++; }
    g.srcs.push(src);
    src.onended = function () {
      if (g.live) liveSrc--;
      var i = g.srcs.indexOf(src); if (i >= 0) g.srcs.splice(i, 1);
      for (var k = 0; k < nodes.length; k++) { try { nodes[k].disconnect(); } catch (e) {} }
    };
  }
  // an enveloped oscillator note. o: { type, f, f2, glide, t, dur, vol, a (attack), dest, rev, pan, lp, lp2, q, det }
  function tone(g, o) {
    var c = g.c, t = o.t, osc = c.createOscillator(), env = c.createGain(), out = env, nodes = [osc, env];
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t); if (o.det) osc.detune.value = o.det;
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    var a = o.a || 0.006, sus = o.sus == null ? 0 : o.sus;
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(o.vol, t + a);
    if (sus) { env.gain.setTargetAtTime(o.vol * sus, t + a, (o.dur - a) * 0.35); env.gain.setTargetAtTime(0.0001, t + o.dur, o.rel || 0.08); }
    else env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(env);
    if (o.lp) { var fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + o.dur); fl.Q.value = o.q || 0.8; env.connect(fl); out = fl; nodes.push(fl); }
    if (o.pan && c.createStereoPanner) { var p = c.createStereoPanner(); p.pan.value = o.pan; out.connect(p); out = p; nodes.push(p); }
    out.connect(o.dest || g.intro);
    if (o.rev) { var s = c.createGain(); s.gain.value = o.rev; out.connect(s); s.connect(g.rev); nodes.push(s); }
    track(g, osc, nodes); osc.start(t); osc.stop(t + o.dur + (sus ? (o.rel || 0.08) * 6 : 0) + 0.05);
  }
  // filtered noise. o: { t, dur, vol, type, f, f2, q, a, dest, rev, pan, pan2, pink, sweep }
  function noise(g, o) {
    var c = g.c, t = o.t, s = c.createBufferSource(), fl = c.createBiquadFilter(), env = c.createGain(), out = env, nodes = [s, fl, env];
    s.buffer = o.pink ? g.pink : g.noise; s.loop = true;
    fl.type = o.type || 'bandpass'; fl.frequency.setValueAtTime(o.f || 1500, t); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || o.dur)); fl.Q.value = o.q || 1;
    var a = o.a || 0.004;
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(o.vol, t + a); env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(fl); fl.connect(env);
    if ((o.pan || o.pan2) && c.createStereoPanner) { var p = c.createStereoPanner(); p.pan.setValueAtTime(o.pan || 0, t); if (o.pan2 != null) p.pan.linearRampToValueAtTime(o.pan2, t + o.dur); out.connect(p); out = p; nodes.push(p); }
    out.connect(o.dest || g.intro);
    if (o.rev) { var r = c.createGain(); r.gain.value = o.rev; out.connect(r); r.connect(g.rev); nodes.push(r); }
    track(g, s, nodes); s.start(t, Math.random() * 1.5); s.stop(t + o.dur + 0.05);
  }

  // ---------------------------------------------------------------- the instruments
  // bright brass: two detuned saws through a lowpass that opens on the attack
  function brass(g, m, t, dur, v, pan) {
    var f = mtof(m);
    [-7, 7].forEach(function (det) { tone(g, { type: 'sawtooth', f: f, t: t, dur: dur, vol: v * 0.5, a: 0.025, sus: 0.75, rel: 0.09, lp: 700 + f * 1.2, lp2: 1400 + f * 2.2, q: 1.2, det: det, pan: pan, rev: 0.3 }); });
    tone(g, { type: 'triangle', f: f * 2, t: t, dur: Math.min(0.35, dur), vol: v * 0.12, a: 0.004, pan: pan, rev: 0.4 });   // a glockenspiel sparkle on top
  }
  function pad(g, ms, t, dur, v) { ms.forEach(function (m, i) { tone(g, { type: 'sawtooth', f: mtof(m), t: t, dur: dur, vol: v, a: 0.06, sus: 0.8, rel: 0.25, lp: 900, lp2: 1300, det: i % 2 ? 5 : -5, pan: (i - 1.5) * 0.25, rev: 0.45 }); }); }
  function bass(g, m, t, dur, v) { tone(g, { type: 'triangle', f: mtof(m), t: t, dur: dur, vol: v, a: 0.01, sus: 0.7, rel: 0.1, lp: 600 }); }
  function timp(g, m, t, v) { tone(g, { type: 'sine', f: mtof(m) * 1.5, f2: mtof(m), glide: 0.08, t: t, dur: 0.7, vol: v, a: 0.003 }); noise(g, { t: t, dur: 0.12, vol: v * 0.35, type: 'lowpass', f: 900, q: 0.7 }); }
  function snare(g, t, v) { noise(g, { t: t, dur: 0.09, vol: v, type: 'bandpass', f: 2600, q: 0.8 }); tone(g, { type: 'triangle', f: 210, f2: 150, t: t, dur: 0.06, vol: v * 0.4 }); }
  function cymbal(g, t, v) { noise(g, { t: t, dur: 2.2, vol: v, type: 'highpass', f: 5200, q: 0.5, a: 0.003, rev: 0.6 }); noise(g, { t: t, dur: 0.5, vol: v * 0.6, type: 'bandpass', f: 9000, q: 0.6 }); }

  // The fanfare (original): C major, eight beats to the big chord, which lands on the pose. o.beat = seconds per beat.
  function fanfare(g, t0, o) {
    var bt = (o && o.beat) || 0.44, T = function (b) { return t0 + b * bt; };
    var mel = [[0, 67, 0.3], [0.33, 72, 0.3], [0.67, 76, 0.3], [1, 79, 0.95], [2, 76, 0.45], [2.5, 79, 0.45], [3, 81, 0.7], [3.75, 79, 0.24], [4, 77, 0.45], [4.5, 81, 0.45], [5, 84, 0.95], [6, 83, 0.45], [6.5, 79, 0.22], [6.75, 83, 0.22], [7, 86, 0.8]];
    mel.forEach(function (n) { brass(g, n[1], T(n[0]), n[2] * bt * 2.1, 0.16, 0.1); });
    pad(g, [60, 64, 67], T(1), bt * 2, 0.035); pad(g, [65, 69, 72], T(3), bt * 2, 0.035); pad(g, [65, 69, 72], T(5), bt, 0.035); pad(g, [67, 71, 74, 77], T(6), bt * 2, 0.035);
    bass(g, 48, T(1), bt * 1.9, 0.2); bass(g, 45, T(3), bt * 0.9, 0.2); bass(g, 41, T(4), bt * 0.9, 0.2); bass(g, 41, T(5), bt * 0.9, 0.2); bass(g, 43, T(6), bt * 1.9, 0.2);
    timp(g, 36, T(1), 0.3); timp(g, 36, T(3), 0.2); timp(g, 41, T(5), 0.25); timp(g, 43, T(7.5), 0.25);
    for (var r = 0; r < 16; r++) snare(g, T(6 + r * 0.125), 0.03 + r * 0.006);   // a drum roll into the chord
    // the big chord: brass C major over C, a timpani hit and a cymbal
    [72, 76, 79, 84].forEach(function (m, i) { brass(g, m, T(8), bt * 3.2, 0.12, (i - 1.5) * 0.3); });
    pad(g, [48, 55, 60, 64], T(8), bt * 3.4, 0.045); bass(g, 36, T(8), bt * 3, 0.24);
    timp(g, 36, T(8), 0.42); cymbal(g, T(8), 0.09);
  }
  // one cube landing on the stage or on another cube (v: 0..1). A deep wooden knock with a little click.
  function thud(g, t, o) {
    var v = Math.max(0.08, Math.min(1, o.v || 0.5)), f = (o.top ? 120 : 92) * rnd(0.94, 1.06);
    tone(g, { type: 'sine', f: f * 1.8, f2: f, glide: 0.05, t: t, dur: 0.24 + v * 0.12, vol: 0.32 * v, a: 0.002, pan: o.pan });
    noise(g, { t: t, dur: 0.07, vol: 0.18 * v, type: 'lowpass', f: 1400 + v * 1200, q: 0.8, pan: o.pan, rev: 0.25 });
    tone(g, { type: 'triangle', f: rnd(900, 1300), t: t, dur: 0.03, vol: 0.05 * v, pan: o.pan });
  }
  function tick(g, t, o) { var v = o.v || 0.4; tone(g, { type: 'triangle', f: rnd(700, 900), t: t, dur: 0.06, vol: 0.09 * v, pan: o.pan }); tone(g, { type: 'sine', f: 160, f2: 110, t: t, dur: 0.1, vol: 0.12 * v, pan: o.pan }); }
  // the floodlights coming up: four heavy clunks, left to right, and a rising electric hum under them
  function lightsUp(g, t) {
    for (var i = 0; i < 4; i++) {
      var tt = t + i * 0.18, pan = -0.75 + i * 0.5;
      tone(g, { type: 'sine', f: 70, f2: 48, t: tt, dur: 0.3, vol: 0.22, pan: pan }); noise(g, { t: tt, dur: 0.05, vol: 0.12, type: 'bandpass', f: 3200, q: 2, pan: pan, rev: 0.5 });
      tone(g, { type: 'square', f: 1100, t: tt, dur: 0.018, vol: 0.03, pan: pan });
    }
    tone(g, { type: 'sawtooth', f: 50, f2: 100, glide: 0.9, t: t, dur: 1.1, vol: 0.018, a: 0.3, lp: 300 });
  }
  function liftoff(g, t) { noise(g, { t: t, dur: 0.5, vol: 0.12, type: 'bandpass', f: 300, f2: 1800, q: 1, a: 0.05 }); tone(g, { type: 'sine', f: 140, f2: 420, glide: 0.4, t: t, dur: 0.42, vol: 0.08 }); }
  function whoosh(g, t) { noise(g, { t: t, dur: 0.75, vol: 0.2, type: 'bandpass', f: 380, f2: 3200, sweep: 0.6, q: 1.3, a: 0.25, pan: -0.8, pan2: 0.8, rev: 0.4 }); }
  function sparkle(g, t, o) {
    var n = [88, 91, 93, 96, 100, 103], d = (o && o.d) || 0.07;
    n.forEach(function (m, i) { tone(g, { type: 'sine', f: mtof(m), t: t + i * d, dur: 0.5, vol: 0.045, a: 0.003, pan: -0.6 + i * 0.24, rev: 0.6 }); tone(g, { type: 'sine', f: mtof(m) * 2.76, t: t + i * d, dur: 0.18, vol: 0.012, pan: -0.6 + i * 0.24 }); });
  }
  function chime(g, t) { [76, 79, 84].forEach(function (m, i) { tone(g, { type: 'sine', f: mtof(m), t: t + i * 0.09, dur: 0.9, vol: 0.07, a: 0.004, rev: 0.5 }); tone(g, { type: 'triangle', f: mtof(m + 12), t: t + i * 0.09, dur: 0.25, vol: 0.02 }); }); }
  // the crowd: a swell of many voices (pink noise through vowel-ish bands) with a few whistles and "woo"s on top
  function crowd(g, t) {
    [[520, 0.11], [1050, 0.08], [2500, 0.035]].forEach(function (b, i) { noise(g, { t: t, dur: 3.4, vol: b[1], type: 'bandpass', f: b[0] * 0.8, f2: b[0] * 1.1, sweep: 0.7, q: 1.4, a: 0.55, pink: true, pan: (i - 1) * 0.3, rev: 0.4 }); });
    noise(g, { t: t + 0.5, dur: 2.2, vol: 0.05, type: 'bandpass', f: 1800, q: 0.7, a: 0.15, pink: true, pan: 0.5 });
    for (var k = 0; k < 4; k++) { var tt = t + 0.35 + k * rnd(0.25, 0.45), f0 = rnd(1500, 2300); tone(g, { type: 'sine', f: f0, f2: f0 * 1.35, glide: 0.25, t: tt, dur: 0.45, vol: 0.022, a: 0.03, pan: rnd(-0.8, 0.8), rev: 0.5 }); }
    for (var w = 0; w < 3; w++) { var tw = t + 0.2 + w * 0.3, fv = rnd(330, 470); tone(g, { type: 'sawtooth', f: fv, f2: fv * 1.5, glide: 0.35, t: tw, dur: 0.6, vol: 0.015, a: 0.06, lp: 1500, pan: rnd(-0.7, 0.7), rev: 0.5 }); }
  }
  function confetti(g, t) { [-0.7, 0.7].forEach(function (p, i) { noise(g, { t: t + i * 0.05, dur: 0.16, vol: 0.14, type: 'bandpass', f: 1600, q: 0.9, pan: p, rev: 0.4 }); tone(g, { type: 'sine', f: 180, f2: 70, t: t + i * 0.05, dur: 0.15, vol: 0.14, pan: p }); }); }
  function boing(g, t, o) { tone(g, { type: 'sine', f: 260, f2: 620, glide: 0.16, t: t, dur: 0.26, vol: 0.07, a: 0.01, pan: o.pan, rev: 0.3 }); }
  function pat(g, t, o) { tone(g, { type: 'sine', f: 180, f2: 90, t: t, dur: 0.14, vol: 0.13, pan: o.pan }); noise(g, { t: t, dur: 0.04, vol: 0.05, type: 'lowpass', f: 1800, pan: o.pan }); }
  function hi(g, t, o) { tone(g, { type: 'sine', f: 620, f2: 880, glide: 0.12, t: t, dur: 0.2, vol: 0.04, pan: o.pan, rev: 0.4 }); tone(g, { type: 'sine', f: 880, f2: 700, glide: 0.1, t: t + 0.2, dur: 0.22, vol: 0.035, pan: o.pan, rev: 0.4 }); }
  function clack(g, t) { tone(g, { type: 'sine', f: 210, f2: 120, t: t, dur: 0.12, vol: 0.11 }); tone(g, { type: 'triangle', f: 1300, t: t, dur: 0.03, vol: 0.03 }); }
  function twinkle(g, t) { sparkle(g, t, { d: 0.11 }); }
  var VOICES = { fanfare: fanfare, thud: thud, tick: tick, lightsUp: lightsUp, liftoff: liftoff, whoosh: whoosh, sparkle: sparkle, chime: chime, crowd: crowd, confetti: confetti, boing: boing, pat: pat, hi: hi, clack: clack, twinkle: twinkle };
  // play one voice through its level trim: the voice's notes go to a small trim gain in front of the intro bus
  function voice(g, name, t, o) {
    var keep = g.intro, tg = g.c.createGain(); tg.gain.value = TRIM[name] || 1; tg.connect(keep); g.intro = tg;
    try { VOICES[name](g, t, o || {}); } finally { g.intro = keep; }
    if (g.live) setTimeout(function () { try { tg.disconnect(); } catch (e) {} }, Math.max(0, t - g.c.currentTime + 8) * 1000);
  }

  // ---------------------------------------------------------------- live context
  function ready() { return !!(ac && G); }
  function sharedDests() { return { sfx: Snd.bus('sfx'), amb: Snd.bus('amb'), ui: Snd.bus('ui') }; }
  function unlock() {
    try {
      if (sharedOK()) {
        try { Snd.unlock(); } catch (e) {}
        var sc = Snd.context(), d = sc ? sharedDests() : null;
        // (re)build on the shared context, also when the shared mix was rebuilt
        if (sc && (!G || G.c !== sc || !G.dests || G.dests.sfx !== d.sfx)) { if (ambNodes) { try { ambNodes[0].stop(); } catch (e) {} ambNodes = null; liveSrc--; } ac = sc; own = false; G = graph(ac, true, d); }
      }
      if (!ac) {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ac = new AC(); own = true; G = graph(ac, true);
      }
      if (own && ac.state === 'suspended' && ac.resume) { var p = ac.resume(); if (p && p.catch) p.catch(function () {}); }
      clearTimeout(suspendT);
      G.master.gain.setTargetAtTime(level(), ac.currentTime, 0.02);
    } catch (e) { ac = null; G = null; }
  }
  function begin() {
    if (!ready()) return 0;
    unlock();
    G.intro.gain.cancelScheduledValues(ac.currentTime); G.intro.gain.setValueAtTime(1, ac.currentTime);
    base = ac.currentTime + 0.06; score = [];
    return base;
  }
  function play(name, t, o, now) {
    try {
      if (!VOICES[name]) return;
      score.push([name, now ? -1 : t, o || {}]);
      if (!ready() || level() <= 0 || ac.state !== 'running') return;
      var when = now ? ac.currentTime + 0.01 + (t || 0) : Math.max(ac.currentTime, base + (t || 0));
      voice(G, name, when, o || {});
    } catch (e) {}
  }
  function cancel() {
    if (!ready()) return;
    var n = ac.currentTime; G.intro.gain.cancelScheduledValues(n); G.intro.gain.setTargetAtTime(0, n, 0.04);
    // the old intro bus goes quiet and is retired (its scheduled voices stop on their own); a fresh one takes its place
    var old = G.intro, srcs = G.srcs.slice();
    G.intro = ac.createGain(); G.intro.connect(G.master);
    setTimeout(function () { srcs.forEach(function (s) { try { s.stop(); } catch (e) {} }); try { old.disconnect(); } catch (e) {} }, 300);
  }
  // a very quiet, steady murmur of the stands (no rhythm, no melody)
  var ambNodes = null;
  function ambience(on) {
    if (!ready()) return;
    var n = ac.currentTime;
    if (on && setg().titleFx !== false) {
      if (!ambNodes) {
        var s = ac.createBufferSource(), f = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(); s.buffer = G.pink; s.loop = true;
        f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6; f2.type = 'lowpass'; f2.frequency.value = 1400;
        s.connect(f); f.connect(f2); f2.connect(G.amb); s.start(n, Math.random() * 3); ambNodes = [s, f, f2]; liveSrc++; created++;
      }
      G.amb.gain.cancelScheduledValues(n); G.amb.gain.setTargetAtTime(AMB, n, 0.9); ambOn = true;
    } else if (ambNodes) {
      G.amb.gain.cancelScheduledValues(n); G.amb.gain.setTargetAtTime(0, n, 0.08);
      var nodes = ambNodes; ambNodes = null; ambOn = false;
      setTimeout(function () { try { nodes[0].stop(); } catch (e) {} nodes.forEach(function (x) { try { x.disconnect(); } catch (e) {} }); liveSrc--; }, 400);
    }
  }
  var lastHover = 0;
  function ui(kind, v) {
    if (!ready() || level() <= 0 || ac.state !== 'running') return;
    var t = ac.currentTime + 0.005;
    try {
      if (kind === 'hover') { var now = performance.now(); if (now - lastHover < 70) return; lastHover = now; tone(G, { type: 'sine', f: 1320, t: t, dur: 0.05, vol: 0.022, a: 0.003, dest: G.ui }); }
      else if (kind === 'press') { tone(G, { type: 'sine', f: 560, f2: 300, t: t, dur: 0.08, vol: 0.08, a: 0.002, dest: G.ui }); noise(G, { t: t, dur: 0.02, vol: 0.03, type: 'highpass', f: 3000, dest: G.ui }); }
      else if (kind === 'step') { var vv = v || 0.5; tone(G, { type: 'sine', f: rnd(120, 150), f2: 80, t: t, dur: 0.08, vol: 0.06 * vv, dest: G.intro }); noise(G, { t: t, dur: 0.04, vol: 0.03 * vv, type: 'lowpass', f: 1200, dest: G.intro }); }
    } catch (e) {}
  }
  function stopAll() {
    if (!ready()) return;
    var n = ac.currentTime;
    ambience(false); cancel();
    G.master.gain.cancelScheduledValues(n); G.master.gain.setTargetAtTime(0, n, 0.03);
    clearTimeout(suspendT);
    suspendT = setTimeout(function () {
      G.srcs.slice().forEach(function (s) { try { s.stop(); } catch (e) {} });
      // only our own context is suspended: the shared one keeps the game's music and sounds going
      try { if (own && ac.state === 'running' && ac.suspend) ac.suspend().catch(function () {}); } catch (e) {}
    }, 450);
  }
  document.addEventListener('visibilitychange', function () {
    try { if (!ac || !own) return; if (document.hidden) { if (ac.suspend) ac.suspend().catch(function () {}); } else if (document.body.classList.contains('t3on') && ac.resume) ac.resume().catch(function () {}); } catch (e) {}
  });
  // every tap resumes the context if a browser suspended it (iPad), while the title is up
  ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { if (ac && own && ac.state !== 'running' && document.body.classList.contains('t3on')) unlock(); }, true); });

  // ---------------------------------------------------------------- checks: render a score offline and measure it
  function _render(sc, seconds) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return Promise.resolve(null);
    var sr = 44100, len = Math.ceil(sr * (seconds || 7.5)), oc = new OAC(2, len, sr), g = graph(oc, false);
    (sc || score).forEach(function (e) { if (VOICES[e[0]]) voice(g, e[0], 0.06 + Math.max(0, e[1]), e[2] || {}); });
    return oc.startRendering().then(function (buf) {
      var L = buf.getChannelData(0), R = buf.getChannelData(1), peak = 0, clip = 0, sum = 0, win = Math.floor(sr * 0.5), wins = [], ws = 0, wp = 0;
      for (var i = 0; i < L.length; i++) {
        var a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a >= 0.999) clip++; sum += L[i] * L[i] + R[i] * R[i];
        ws += L[i] * L[i]; if (a > wp) wp = a;
        if ((i + 1) % win === 0) { wins.push({ t: +((i + 1) / sr).toFixed(1), rms: +Math.sqrt(ws / win).toFixed(4), peak: +wp.toFixed(3) }); ws = 0; wp = 0; }
      }
      return { seconds: +(L.length / sr).toFixed(2), peak: +peak.toFixed(3), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rms: +Math.sqrt(sum / (2 * L.length)).toFixed(4), clipped: clip, events: (sc || score).length, windows: wins };
    });
  }

  // BIRTHDAY (docs/handoff/audio2.md): the show (js/three/birthday.js) only loads the choir 9.6 s in, just before the
  // song. As soon as the show starts (it puts .bday-on on <body>), load js/birthday-sfx.js here as a plain script so
  // the whole song is rendered offline while the parade runs (it renders itself when it loads; about 1.5 s on a laptop).
  (function watchBirthday() {
    try {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) { if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', watchBirthday); return; }
      var mo = new MutationObserver(function () {
        if (!document.body.classList.contains('bday-on')) return;
        if (window.BirthdaySfx) { try { if (BirthdaySfx.prerender) BirthdaySfx.prerender(); } catch (e) {} return; }
        if (watchBirthday.loading) return; watchBirthday.loading = true;
        var s = document.createElement('script'); s.src = 'js/birthday-sfx.js'; s.onerror = function () { watchBirthday.loading = false; }; document.head.appendChild(s);
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
  })();

  return {
    unlock: unlock, begin: begin, play: play, cancel: cancel, ambience: ambience, ui: ui, stopAll: stopAll,
    stats: function () { return { ctx: ac ? ac.state : null, live: liveSrc, created: created, ambience: ambOn, level: level(), scheduled: score.length }; },
    score: function () { return score.slice(); },
    _render: _render, _trim: TRIM,
    // offline audit: a score into any context (dests: { sfx, amb, ui } nodes; inside Snd._measure use the shared buses)
    _into: function (c, dests, sc) { var g = graph(c, false, dests); (sc || []).forEach(function (e) { if (VOICES[e[0]]) voice(g, e[0], 0.06 + Math.max(0, e[1]), e[2] || {}); }); return g; },
    _ambInto: function (c, dests) { var g = graph(c, false, dests), s = c.createBufferSource(), f = c.createBiquadFilter(), f2 = c.createBiquadFilter(); s.buffer = g.pink; s.loop = true; f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6; f2.type = 'lowpass'; f2.frequency.value = 1400; s.connect(f); f.connect(f2); f2.connect(g.amb); g.amb.gain.value = AMB; s.start(0); return g; },
    _uiInto: function (c, dests, kind) { var g = graph(c, false, dests), t = 0.02; if (kind === 'hover') tone(g, { type: 'sine', f: 1320, t: t, dur: 0.05, vol: 0.022, a: 0.003, dest: g.ui }); else if (kind === 'press') { tone(g, { type: 'sine', f: 560, f2: 300, t: t, dur: 0.08, vol: 0.08, a: 0.002, dest: g.ui }); noise(g, { t: t, dur: 0.02, vol: 0.03, type: 'highpass', f: 3000, dest: g.ui }); } return g; }
  };
})();
