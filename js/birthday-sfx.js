// BIRTHDAY: the creature choir for the birthday easter egg (js/three/birthday.js loads this file on demand with a
// dynamic import; it also works as a plain <script>). "Happy Birthday to You" (traditional melody, public domain),
// sung by a little synthesised creature choir (three voices: the tune, a big low monster an octave down, a small
// bright one) with formant filters for the vowels, over a soft oom-pah-pah waltz (bass + plucked chords).
// Everything plays on the game's one AudioContext (Snd.context()) through Snd.bus('music') (or 'sfx' when the music
// is switched off but effects are on), so Mute, both volume sliders and the shared limiter apply.
//
//   BirthdaySfx.song(plan, delay) -> { t0 (audio time of beat 0), stop() }   plan: { notes, chords, beat } from birthday.js
//   BirthdaySfx.pop(kind)           'sparkle' | 'hooray' little one-shots
//   BirthdaySfx.stopAll()
(function () {
  var live = [], buses = [], ownCtx = null;
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function shared() { return typeof Snd !== 'undefined' && Snd && typeof Snd.context === 'function' && typeof Snd.bus === 'function'; }
  function ctx() {
    if (shared()) { var c = Snd.context(); if (c) return c; }
    if (!ownCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ownCtx = new AC(); }
    return ownCtx;
  }
  function out(c) {
    if (shared() && c === Snd.context()) {
      var lm = Snd.level ? Snd.level('music') : 1, ls = Snd.level ? Snd.level('sfx') : 1;
      if (lm > 0) return { node: Snd.bus('music'), k: 1.6 };      // the music bus sits lower (music volume 0.35 by default)
      if (ls > 0) return { node: Snd.bus('sfx'), k: 0.7 };
      return null;
    }
    if (setg().mute) return null;
    return { node: c.destination, k: 0.5 };
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var VOW = { a: [800, 1250], ee: [320, 2300], er: [500, 1450], eh: [560, 1800], oo: [340, 860], oh: [480, 900], i: [400, 2000] };
  function track(n) { live.push(n); n.onended = function () { var i = live.indexOf(n); if (i >= 0) live.splice(i, 1); }; }

  // one sung note: saw + triangle, a touch of vibrato after the attack, two formant band-passes plus a soft body
  function voice(c, dest, t, d, f, vowel, o) {
    var F = VOW[vowel] || VOW.a, fs = o.fs || 1, g = c.createGain(), mix = c.createGain(), s = c.createOscillator(), tr = c.createOscillator();
    var b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter(), lp = c.createBiquadFilter(), vib = c.createOscillator(), vg = c.createGain();
    s.type = 'sawtooth'; tr.type = 'triangle'; s.frequency.value = f; tr.frequency.value = f; s.detune.value = o.det || 0; tr.detune.value = (o.det || 0) + 4;
    vib.frequency.value = 5.4 + Math.random() * 0.6; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.3, d * 0.6));
    vib.connect(vg); vg.connect(s.frequency); vg.connect(tr.frequency);
    b1.type = b2.type = 'bandpass'; b1.frequency.value = F[0] * fs; b2.frequency.value = F[1] * fs; b1.Q.value = 5; b2.Q.value = 7;
    lp.type = 'lowpass'; lp.frequency.value = 1500 * fs;
    var sg = c.createGain(); sg.gain.value = 0.55; s.connect(sg); sg.connect(g); tr.connect(g);
    g.connect(b1); g.connect(b2); g.connect(lp);
    var g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain(); g1.gain.value = 1.1; g2.gain.value = 0.55; g3.gain.value = 0.35;
    b1.connect(g1); b2.connect(g2); lp.connect(g3); g1.connect(mix); g2.connect(mix); g3.connect(mix);
    var v = o.vol, att = 0.05, rel = 0.12, end = t + d;
    mix.gain.setValueAtTime(0.0001, t); mix.gain.linearRampToValueAtTime(v, t + att); mix.gain.setValueAtTime(v * 0.9, Math.max(t + att + 0.01, end - rel));
    mix.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);
    if (o.glide) { s.frequency.setValueAtTime(f * 0.97, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.06); }
    mix.connect(dest);
    [s, tr, vib].forEach(function (n) { n.start(t); n.stop(end + 0.1); track(n); });
  }
  // a plucked tone (the waltz accompaniment): triangle with a quick decay, a little shimmer an octave up
  function pluck(c, dest, t, f, vol, dur) {
    var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(vol * 0.25, t + 0.004); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4);
    o.connect(g); o2.connect(g2); g.connect(dest); g2.connect(dest);
    [o, o2].forEach(function (n) { n.start(t); n.stop(t + dur + 0.05); track(n); });
  }

  function song(plan, delay, into) {   // into: { ctx, dest, k } renders into any context (the offline level check)
    var c = into ? into.ctx : ctx(); if (!c) return null;
    try { if (!into && c.state === 'suspended') c.resume(); } catch (e) {}
    var o = into ? { node: into.dest, k: into.k || 1 } : out(c), t0 = c.currentTime + (delay || 0.12);
    var h = { t0: t0, stop: function () { stopAll(); } };
    if (!o || !o.node) return h;
    var bus = c.createGain(); bus.gain.value = o.k; bus.connect(o.node); h.bus = bus; buses.push(bus);
    plan.notes.forEach(function (n) {
      var t = t0 + n.t, d = Math.max(0.12, n.d * 0.94), f = mtof(n.m);
      voice(c, bus, t, d, f, n.v, { vol: 0.16, fs: 1, glide: true });               // the tune
      voice(c, bus, t, d, f / 2, n.v, { vol: 0.085, fs: 0.82, det: -6 });            // a big monster an octave down
      voice(c, bus, t + 0.012, d, f, n.v, { vol: 0.06, fs: 1.25, det: 9 });          // a small bright creature
    });
    plan.chords.forEach(function (ch) {
      var b = plan.beat;
      pluck(c, bus, t0 + ch.t, mtof(ch.bass), 0.16, b * 1.4);
      for (var k = 1; k < ch.beats; k++) ch.notes.forEach(function (m) { pluck(c, bus, t0 + ch.t + k * b, mtof(m), 0.05, b * 0.9); });
    });
    return h;
  }
  function pop(kind) {
    var c = ctx(); if (!c) return; var o = out(c); if (!o || !o.node) return;
    var t = c.currentTime + 0.02, bus = c.createGain(); bus.gain.value = o.k; bus.connect(o.node); buses.push(bus);
    if (kind === 'sparkle') [84, 88, 91, 96].forEach(function (m, i) { pluck(c, bus, t + i * 0.07, mtof(m), 0.05, 0.5); });
    else if (kind === 'hooray') { voice(c, bus, t, 0.22, mtof(67), 'oo', { vol: 0.12 }); voice(c, bus, t + 0.22, 0.55, mtof(72), 'eh', { vol: 0.14, glide: true }); voice(c, bus, t + 0.22, 0.55, mtof(60), 'eh', { vol: 0.07, fs: 0.8 }); }
  }
  function stopAll() {
    var c = ctx(), n = c ? c.currentTime : 0;
    buses.forEach(function (b) { try { b.gain.cancelScheduledValues(n); b.gain.setTargetAtTime(0.0001, n, 0.04); } catch (e) {} });
    live.slice().forEach(function (s) { try { s.stop(n + 0.25); } catch (e) {} });
    live = []; var old = buses; buses = [];
    setTimeout(function () { old.forEach(function (b) { try { b.disconnect(); } catch (e) {} }); }, 400);
  }
  window.BirthdaySfx = { song: song, pop: pop, stopAll: stopAll, live: function () { return live.length; } };
})();
