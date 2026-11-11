'use strict';
// ======================= SOUND (Web Audio, no files) =======================
var Snd = (function () {
  var ctx = null, master, sfx, mus, wet, noiseBuf = null, timer = null, step = 0, musicWanted = false;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
      master = ctx.createGain(); master.connect(comp);
      sfx = ctx.createGain(); sfx.connect(master);
      mus = ctx.createGain(); mus.connect(master);
      // Room reverb from a generated impulse (no audio files)
      var conv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 1.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      conv.buffer = ir; wet = ctx.createGain(); wet.gain.value = 0.32; wet.connect(conv); conv.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var nd = noiseBuf.getChannelData(0); for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
      apply();
    } catch (e) { ctx = null; }
  }
  function apply() {
    if (!ctx) return;
    master.gain.value = S.set.mute ? 0 : 1; sfx.gain.value = S.set.sfx; mus.gain.value = S.set.music * 0.5;
    if (S.set.mute || S.set.music <= 0) stopMusic(); else if (!timer && musicWanted) musicOn();
  }
  function T(d) { return ctx.currentTime + (d || 0); }
  // A shaped oscillator note. o: {type, f, f2, dur, vol, delay, attack, dest, reverb, filter:{type,f,q,f2}, detune}
  function note(o) {
    if (!ctx) return;
    var t = T(o.delay), osc = ctx.createOscillator(), g = ctx.createGain(), out = g;
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    var a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    if (o.filter) { var fl = ctx.createBiquadFilter(); fl.type = o.filter.type; fl.frequency.setValueAtTime(o.filter.f, t); if (o.filter.f2) fl.frequency.exponentialRampToValueAtTime(o.filter.f2, t + o.dur); fl.Q.value = o.filter.q || 1; g.connect(fl); out = fl; }
    out.connect(o.dest || sfx); if (o.reverb) { var s = ctx.createGain(); s.gain.value = o.reverb; out.connect(s); s.connect(wet); }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  // Filtered noise burst. o: {dur, vol, delay, type, f, f2, q, attack, reverb, dest}
  function hiss(o) {
    if (!ctx) return;
    var t = T(o.delay), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 2000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur); f.Q.value = o.q || 1;
    var a = o.attack || 0.003;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); g.connect(o.dest || sfx);
    if (o.reverb) { var r = ctx.createGain(); r.gain.value = o.reverb; g.connect(r); r.connect(wet); }
    s.start(t, Math.random() * 1.5); s.stop(t + o.dur + 0.05);
  }
  function bell(f, delay, vol, dur) {
    [[1, 1], [2.0, 0.5], [3.01, 0.28], [4.2, 0.18], [5.4, 0.1]].forEach(function (p) { note({ f: f * p[0], dur: (dur || 1.4) / Math.sqrt(p[0]), vol: (vol || 0.18) * p[1], delay: delay, reverb: 0.6 }); });
  }
  function brass(f, delay, dur, vol) {
    [-7, 7].forEach(function (dt) { note({ type: 'sawtooth', f: f, dur: dur, vol: vol || 0.07, delay: delay, attack: 0.04, detune: dt, filter: { type: 'lowpass', f: 600, f2: 2600, q: 2 }, reverb: 0.4 }); });
  }
  function timpani(delay, vol) { note({ f: 110, f2: 70, dur: 0.6, vol: vol || 0.5, delay: delay, reverb: 0.3 }); hiss({ dur: 0.15, vol: 0.15, delay: delay, type: 'lowpass', f: 500 }); }

  // ----- Music: soft pads + plucked arpeggio with echo -----
  var CH = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
  function musicOn() {
    musicWanted = true;
    if (!ctx || timer || S.set.mute || S.set.music <= 0) return;
    step = 0;
    timer = setInterval(function () {
      var ch = CH[Math.floor(step / 8) % 4], i = step % 8, pat = [0, 1, 2, 1, 0, 2, 1, 2];
      if (i === 0) ch.forEach(function (f) { note({ type: 'sawtooth', f: f, dur: 2.5, vol: 0.025, attack: 0.6, filter: { type: 'lowpass', f: 700, q: 0.7 }, dest: mus, reverb: 0.5 }); });
      if (i === 0) note({ f: ch[0] / 2, dur: 2.2, vol: 0.12, dest: mus });
      var f = ch[pat[i]] * 2;
      note({ type: 'triangle', f: f, dur: 0.45, vol: 0.07, dest: mus, reverb: 0.4 });
      note({ type: 'triangle', f: f, dur: 0.35, vol: 0.025, delay: 0.3, dest: mus });
      if (i === 5 && Math.random() < 0.4) bell(ch[2] * 4, 0, 0.03, 1.2);
      step++;
    }, 300);
  }
  function stopMusic() { if (timer) { clearInterval(timer); timer = null; } }

  return {
    init: init, apply: apply, musicOn: musicOn, musicOff: function () { musicWanted = false; stopMusic(); },
    // One die hitting the table or another die (v: 0..1 = how hard)
    diceHit: function (v) {
      if (!ctx) return;
      v = Math.max(0.08, v);
      hiss({ dur: 0.025 + 0.03 * v, vol: 0.55 * v, type: 'bandpass', f: 2600 + Math.random() * 2600, q: 5 });
      note({ type: 'triangle', f: 1100 + Math.random() * 900, dur: 0.045, vol: 0.18 * v });
      note({ f: 170 + Math.random() * 70, dur: 0.09, vol: 0.32 * v, reverb: 0.15 });
    },
    cupRattle: function () {
      if (!ctx) return;
      for (var i = 0; i < 22; i++) hiss({ dur: 0.03, vol: 0.18 + Math.random() * 0.2, delay: i * 0.03 + Math.random() * 0.02, type: 'bandpass', f: 900 + Math.random() * 900, q: 4 });
      note({ f: 140, dur: 0.3, vol: 0.15, delay: 0.05 });
    },
    clatter: function () { for (var i = 0; i < 18; i++) (function (k) { setTimeout(function () { Snd.diceHit(Math.random()); }, k * 55 + Math.random() * 40); })(i); },
    pickup: function () { hiss({ dur: 0.2, vol: 0.12, type: 'highpass', f: 500, f2: 3500, attack: 0.08 }); },
    thunk: function () {
      note({ f: 150, f2: 62, dur: 0.22, vol: 0.6, reverb: 0.15 });
      note({ type: 'triangle', f: 560, dur: 0.07, vol: 0.18 });
      hiss({ dur: 0.06, vol: 0.25, type: 'lowpass', f: 900 });
    },
    click: function () { note({ type: 'sine', f: 1500, dur: 0.04, vol: 0.1 }); note({ type: 'sine', f: 750, dur: 0.05, vol: 0.06 }); },
    pop: function () { note({ f: 420, f2: 980, dur: 0.12, vol: 0.25, glide: 0.08 }); hiss({ dur: 0.04, vol: 0.08, type: 'highpass', f: 3000 }); },
    chime: function () { [1047, 1319, 1568, 2093].forEach(function (f, i) { bell(f, i * 0.085, 0.15, 1.6); }); },
    boop: function () { [[392, 0], [330, 0.13]].forEach(function (n) { note({ f: n[0], dur: 0.35, vol: 0.22, delay: n[1], reverb: 0.3 }); note({ f: n[0] * 4, dur: 0.08, vol: 0.05, delay: n[1] }); }); },
    slam: function () {
      hiss({ dur: 0.35, vol: 0.25, type: 'bandpass', f: 400, f2: 3000, attack: 0.25, q: 1 });
      note({ f: 130, f2: 38, dur: 0.6, vol: 0.9, delay: 0.3, reverb: 0.4 });
      hiss({ dur: 0.18, vol: 0.4, delay: 0.3, type: 'lowpass', f: 600 });
      hiss({ dur: 1.4, vol: 0.18, delay: 0.3, type: 'highpass', f: 6000, reverb: 0.5 });
    },
    fanfare: function () {
      [[523, 0, 0.18], [659, 0.15, 0.18], [784, 0.3, 0.18], [1047, 0.45, 0.9]].forEach(function (n) { brass(n[0], n[1], n[2] + 0.1); brass(n[0] / 2, n[1], n[2] + 0.1, 0.05); });
      brass(784, 0.45, 0.9, 0.05); brass(659, 0.45, 0.9, 0.05);
      [0, 0.08, 0.16, 0.24, 0.32, 0.45].forEach(function (d, i) { timpani(d, i === 5 ? 0.6 : 0.25); });
      hiss({ dur: 1.6, vol: 0.12, delay: 0.45, type: 'highpass', f: 7000, reverb: 0.6 });
    },
    // Stadium crowd cheer (for big wins)
    crowd: function () {
      if (!ctx) return;
      [[450, 0.3], [900, 0.25], [1800, 0.15], [3200, 0.07]].forEach(function (b) { hiss({ dur: 3.2, vol: b[1], type: 'bandpass', f: b[0], q: 0.9, attack: 0.5, reverb: 0.5 }); });
      for (var i = 0; i < 14; i++) { var f = 300 + Math.random() * 500; note({ type: 'sawtooth', f: f, f2: f * (1.3 + Math.random() * 0.4), dur: 0.6 + Math.random() * 0.6, vol: 0.02, delay: Math.random() * 2, attack: 0.15, filter: { type: 'bandpass', f: 900, q: 3 }, reverb: 0.5 }); }
      [0.4, 0.55, 1.6].forEach(function (d) { note({ f: 2400, f2: 2900, dur: 0.18, vol: 0.06, delay: d, glide: 0.09 }); note({ f: 2900, f2: 2300, dur: 0.22, vol: 0.06, delay: d + 0.2 }); });
    }
  };
})();
