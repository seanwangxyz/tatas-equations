'use strict';
// ======================= FIREWORK + REPLAY SOUNDS (classic script) =======================
// Small, soft sounds synthesised with the Web Audio API (no audio files). Never throws; each call returns
// the length in ms (0 if nothing played).
//   FxSfx.boom({delay, size, pan})   a soft, round firework boom (a low thump + a muffled "fff"), then a few
//                                     faint crackles. size 0..1 (bigger = deeper and a little longer), pan -1..1
//   FxSfx.launch({delay, pan})       the quiet rising "fwhhh" of a rocket going up
//   FxSfx.swish({delay})             a tiny air swish (a cube flying in the Goal replay)
//   FxSfx.level()                    0..1, what the sounds are played at right now (0 = muted)
//   FxSfx._offline(kind, sec)        renders one sound offline -> Promise<{peak, rms, sec}> (for checking levels)
// Honours the same settings as js/sound.js: S.set.mute and the S.set.sfx volume (0..1, default 0.8).
// js/sound.js does not share its audio context, so this file makes its own (like js/crowd-sfx.js does),
// unlocked by the first tap or key press (iPad Safari needs a gesture). Its own output chain ends in a gentle
// low-pass and a soft compressor, so nothing is sharp or loud.
var FxSfx = (function () {
  var ac = null, out = null, noise = null, hooked = false;
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function level() {
    var st = setg(); if (st.mute) return 0;
    var v = st.sfx; v = (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : 0.8;
    return v;
  }
  function ctx() {
    if (!ac) {
      var AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      try { ac = new AC(); } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended' && ac.resume) { try { var p = ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    return ac;
  }
  function unlock() { if (level() > 0) ctx(); }
  function hook() {
    if (hooked || typeof document === 'undefined') return; hooked = true;
    ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlock, { passive: true }); });
    document.addEventListener('visibilitychange', function () {
      try { if (!ac) return; var p = document.hidden ? ac.suspend() : ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    });
  }
  hook();
  // output chain: gain -> low-pass (nothing harsh) -> soft compressor -> speakers
  function chain(c) {
    var g = c.createGain(), lp = c.createBiquadFilter(), cp = c.createDynamicsCompressor();
    lp.type = 'lowpass'; lp.frequency.value = 3800; lp.Q.value = 0.4;
    cp.threshold.value = -18; cp.knee.value = 12; cp.ratio.value = 4; cp.attack.value = 0.008; cp.release.value = 0.3;
    g.connect(lp); lp.connect(cp); cp.connect(c.destination);
    return g;
  }
  function bus(c) { if (c !== ac) return chain(c); if (!out || out.ctx !== ac) out = { ctx: ac, g: chain(ac) }; out.g.gain.value = level(); return out.g; }
  function noiseBuf(c) {
    if (noise && noise.ctx === c) return noise.b;
    var sr = c.sampleRate, b = c.createBuffer(1, Math.floor(sr * 2), sr), d = b.getChannelData(0), lp = 0;
    for (var i = 0; i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.6; d[i] = lp * 1.3; }
    noise = { ctx: c, b: b }; return b;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function panner(c, dest, pan) {
    if (!pan || !c.createStereoPanner) return dest;
    var p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(dest); return p;
  }

  // ---- the sounds; each takes (c, dest, t0, opts) and returns its length in seconds ----
  function boomAt(c, dest, t, o) {
    var size = o.size == null ? 0.6 : Math.max(0, Math.min(1, o.size)), d = panner(c, dest, o.pan);
    // the thump: a low sine falling in pitch, soft attack (no click)
    var os = c.createOscillator(), og = c.createGain(), f0 = 95 - 25 * size;
    os.type = 'sine'; os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + 0.5);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.4, t + 0.018); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7 + 0.3 * size);
    os.connect(og); og.connect(d); os.start(t); os.stop(t + 1.1 + 0.3 * size);
    // the body: muffled noise (the "fff" of the burst far away), with a little echo tail
    var ns = c.createBufferSource(), lp = c.createBiquadFilter(), ng = c.createGain();
    ns.buffer = noiseBuf(c); ns.loop = true; lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.9); lp.Q.value = 0.6;
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.24, t + 0.025); ng.gain.exponentialRampToValueAtTime(0.06, t + 0.35); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.3 + 0.4 * size);
    ns.connect(lp); lp.connect(ng); ng.connect(d); ns.start(t, Math.random()); ns.stop(t + 1.8 + 0.4 * size);
    // a few faint crackles a moment later (tiny band-passed noise ticks)
    var n = o.crackle === false ? 0 : 5 + Math.floor(Math.random() * 5);
    for (var i = 0; i < n; i++) {
      var tt = t + 0.35 + Math.random() * 0.8, cs = c.createBufferSource(), bp = c.createBiquadFilter(), cg = c.createGain();
      cs.buffer = noiseBuf(c); bp.type = 'bandpass'; bp.frequency.value = rnd(1800, 3200); bp.Q.value = 3;
      cg.gain.setValueAtTime(0.0001, tt); cg.gain.exponentialRampToValueAtTime(rnd(0.04, 0.09), tt + 0.004); cg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.04);
      cs.connect(bp); bp.connect(cg); cg.connect(d); cs.start(tt, Math.random() * 1.5); cs.stop(tt + 0.06);
    }
    return 1.8 + 0.4 * size;
  }
  function launchAt(c, dest, t, o) {
    var d = panner(c, dest, o.pan), ns = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), dur = 0.9;
    ns.buffer = noiseBuf(c); ns.loop = true; bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(1900, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    ns.connect(bp); bp.connect(g); g.connect(d); ns.start(t, Math.random()); ns.stop(t + dur + 0.05);
    return dur;
  }
  function swishAt(c, dest, t) {
    var ns = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), dur = 0.28;
    ns.buffer = noiseBuf(c); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(2200, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.09); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    ns.connect(bp); bp.connect(g); g.connect(dest); ns.start(t, Math.random()); ns.stop(t + dur + 0.02);
    return dur;
  }
  var KINDS = { boom: boomAt, launch: launchAt, swish: swishAt };
  function play(kind, o) {
    try {
      o = o || {};
      if (level() <= 0) return 0;
      var c = ctx(); if (!c || c.state !== 'running') return 0;
      var sec = KINDS[kind](c, bus(c), c.currentTime + 0.01 + Math.max(0, o.delay || 0), o);
      return Math.round(sec * 1000);
    } catch (e) { return 0; }
  }
  // Renders one sound offline and measures it (no speakers). Level 1 (the sfx volume is applied on top when playing).
  function offline(kind, sec, o) {
    try {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return Promise.resolve(null);
      sec = sec || 2.5;
      var c = new OAC(2, Math.ceil(44100 * sec), 44100), g = chain(c);
      KINDS[kind](c, g, 0.01, o || {});
      return c.startRendering().then(function (buf) {
        var peak = 0, sum = 0, n = 0, last = 0;
        for (var ch = 0; ch < buf.numberOfChannels; ch++) { var d = buf.getChannelData(ch); for (var i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; if (a > 0.001) last = Math.max(last, i); } }
        return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4), sec: +(last / 44100).toFixed(2) };
      });
    } catch (e) { return Promise.resolve(null); }
  }
  return {
    boom: function (o) { return play('boom', o); },
    launch: function (o) { return play('launch', o); },
    swish: function (o) { return play('swish', o); },
    level: level,
    _offline: offline
  };
})();
