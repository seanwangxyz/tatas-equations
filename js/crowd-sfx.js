'use strict';
// ======================= CROWD SOUNDS + crowdReact() (classic script) =======================
// CrowdSfx.play(kind)   kind: 'clap' | 'ooh' | 'gasp' | 'cheer' | 'aw' ('aww' accepted). Returns ms, 0 if nothing played.
//   Small, soft, synthesised with the Web Audio API (no audio files). At most one crowd sound about every
//   second (CrowdSfx.GAP ms). Plays on the game's shared context through Snd.bus('crowd') (js/sound.js), so Mute,
//   the Effects volume and the Crowd balance (S.set.mix.crowd) apply, and the shared limiter guards it. Without
//   js/sound.js it makes its own context (S.set.mute / S.set.sfx honoured), unlocked by the first tap.
//   Levels: audited offline (docs/handoff/sound.md), each kind trimmed to about -24 LUFS (clap -27: it is frequent).
// crowdReact(kind, opts) one call for game code: the 3D crowd reacts (T3.crowd, when the 3D table is on)
//   and the matching sound plays. Does nothing when S.set.crowd === false. Never throws.
var CrowdSfx = (function () {
  var ac = null, own = false, out = null, noise = null, last = -1e9, hooked = false, GAP = 950, dst = null;
  // clap re-measured with the settled meter (docs/handoff/music.md): -24.8, target -27
  var KTRIM = { chant: 0.7, clap: 0.78, ooh: 0.78, gasp: 2.7, cheer: 0.95, aw: 1.28 };
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function sharedOK() { return typeof Snd !== 'undefined' && Snd && typeof Snd.bus === 'function' && typeof Snd.context === 'function'; }
  function level() {
    if (sharedOK()) return Snd.level('crowd');
    var st = setg(); if (st.mute) return 0;
    var v = st.sfx; v = (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : 0.8;
    return v;
  }
  function shared() {
    try {
      if (typeof Snd === 'undefined' || !Snd) return null;
      var c = typeof Snd.context === 'function' ? Snd.context() : Snd.ctx;
      return c && c.createGain ? c : null;
    } catch (e) { return null; }
  }
  function ctx() {
    var c = shared();
    if (c && c !== ac) { ac = c; own = false; out = null; noise = null; }
    if (!ac) {
      var AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      try { ac = new AC(); own = true; } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended' && ac.resume) { try { var p = ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    return ac;
  }
  function unlock() { if (level() > 0) ctx(); }
  function hook() {
    if (hooked || typeof document === 'undefined') return; hooked = true;
    ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlock, { passive: true }); });
    document.addEventListener('visibilitychange', function () {
      try { if (!ac || !own) return; var p = document.hidden ? ac.suspend() : ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    });
  }
  hook();
  // output chain: gain -> gentle lowpass (nothing harsh) -> soft compressor -> speakers
  function bus() {
    var dest = (!own && sharedOK()) ? Snd.bus('crowd') : ac.destination;
    if (out && out.ctx === ac && out.dest === dest) return out;
    var g = ac.createGain(), lp = ac.createBiquadFilter(), cp = ac.createDynamicsCompressor();
    lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.5;
    cp.threshold.value = -20; cp.knee.value = 12; cp.ratio.value = 4; cp.attack.value = 0.01; cp.release.value = 0.25;
    g.connect(lp); lp.connect(cp); cp.connect(dest);
    out = { ctx: ac, g: g, dest: dest }; return out;
  }
  function noiseBuf() {
    if (noise && noise.ctx === ac) return noise.b;
    var sr = ac.sampleRate, b = ac.createBuffer(1, Math.floor(sr * 2), sr), d = b.getChannelData(0), lp = 0;
    for (var i = 0; i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.5; d[i] = lp * 1.4; } // slightly softened white noise
    noise = { ctx: ac, b: b }; return b;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pan(node, p) { if (!ac.createStereoPanner) return node; var s = ac.createStereoPanner(); s.pan.value = p; node.connect(s); return s; }
  function stopAt(nodes, t) { setTimeout(function () { nodes.forEach(function (n) { try { n.disconnect(); } catch (e) {} }); }, Math.max(0, (t - ac.currentTime) * 1000) + 200); }
  // one filtered noise burst: a hand clap or a breath
  function burst(t, dur, f, q, vol, p, type, f2) {
    var s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf(); fl.type = type || 'bandpass'; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.006, dur / 4) + (type === 'lowpass' ? dur * 0.3 : 0)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); pan(g, p).connect(dst || bus().g);
    s.start(t, Math.random() * Math.max(0, 1.9 - dur), dur + 0.05); stopAt([s, fl, g], t + dur);
  }
  // one soft voice: a triangle wave through two vowel formants, gliding from f0 to f1
  var VOW = { oo: [320, 800], oh: [450, 850], ah: [700, 1150], aw: [600, 950], ay: [550, 1700] };
  function voice(t, dur, f0, f1, vow, vol, p, att) {
    var o = ac.createOscillator(), g = ac.createGain(), mix = ac.createGain(), fm = VOW[vow] || VOW.ah, nodes = [o, g, mix];
    o.type = 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
    o.detune.value = rnd(-25, 25);
    for (var k = 0; k < 2; k++) { var b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fm[k] * rnd(0.94, 1.06); b.Q.value = 4; g.connect(b); b.connect(mix); nodes.push(b); }
    var a = att || 0.08;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a, dur - 0.25)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); pan(mix, p).connect(dst || bus().g);
    o.start(t); o.stop(t + dur + 0.05); stopAt(nodes, t + dur);
  }
  function claps(t0, span, n, vol) { for (var i = 0; i < n; i++) { var u = i / n, t = t0 + u * span + rnd(0, 0.05); burst(t, rnd(0.03, 0.06), rnd(1000, 1900), 1.3, vol * (1 - 0.6 * u) * rnd(0.6, 1), rnd(-0.6, 0.6)); } }
  // The crowd sings in the music's key: each voice starts on a C major chord tone (C E G, A) in its range, a few cents
  // apart like real people, and glides by a musical interval (ooh up a tone, cheer up a third, aw down a fourth).
  var KEYHZ = []; (function () { [0, 4, 7, 9].forEach(function (pc) { for (var o = 2; o <= 5; o++) KEYHZ.push(440 * Math.pow(2, (12 * (o + 1) + pc - 69) / 12)); }); })();
  function keyed(lo, hi) { var c = KEYHZ.filter(function (f) { return f >= lo && f <= hi; }); return c.length ? c[Math.floor(Math.random() * c.length)] * Math.pow(2, rnd(-12, 12) / 1200) : rnd(lo, hi); }
  function crowdOf(n, t0, dur, lo, hi, glide, vow, vol, att) {
    for (var i = 0; i < n; i++) { var f = keyed(lo, hi), d = t0 + rnd(0, 0.08); voice(d, dur * rnd(0.85, 1.05), f, f * glide * Math.pow(2, rnd(-15, 15) / 1200), vow, vol, rnd(-0.7, 0.7), att); }
  }
  var KINDS = {
    clap: function (t) { claps(t, 1.0, 16, 0.45); return 1100; },
    ooh: function (t) { crowdOf(5, t, 1.0, 170, 270, 1.1225, 'oo', 0.06, 0.18); burst(t, 0.9, 500, 0.7, 0.04, 0, 'lowpass'); return 1000; },
    gasp: function (t) { burst(t, 0.34, 900, 0.8, 0.25, 0, 'bandpass', 2400); crowdOf(3, t + 0.02, 0.3, 230, 340, 1.1225, 'ah', 0.06, 0.04); return 400; },
    cheer: function (t) {
      burst(t, 1.5, 1600, 0.6, 0.08, 0, 'lowpass'); // the roar under it, soft
      crowdOf(6, t, 1.2, 220, 360, 1.2599, 'ay', 0.05, 0.1);
      claps(t + 0.25, 1.1, 14, 0.3);
      return 1500;
    },
    aw: function (t) { crowdOf(5, t, 1.0, 230, 340, 0.7492, 'aw', 0.08, 0.12); return 1000; },
    // once after a great moment (hook): the game's theme head, clapped and sung by the stands: clap-clap CLAAP, clap CLAP
    chant: function (t) {
      var ts = [0, 0.25, 0.5, 1.25, 1.5], hz = [196, 261.6, 329.6, 293.7, 329.6];
      ts.forEach(function (x, i) {
        var long = i === 2 || i === 4;
        for (var k = 0; k < 4; k++) burst(t + x + rnd(0, 0.025), rnd(0.03, 0.05), rnd(1000, 1800), 1.3, (long ? 0.4 : 0.3) * rnd(0.7, 1), rnd(-0.6, 0.6));
        for (var v = 0; v < 3; v++) { var f = hz[i] * Math.pow(2, rnd(-10, 10) / 1200) * (v === 2 ? 0.5 : 1); voice(t + x + rnd(0, 0.02), long ? 0.5 : 0.2, f, f, 'oh', 0.05, rnd(-0.7, 0.7), 0.04); }
      });
      return 2100;
    }
  };
  function play(kind, force) {
    try {
      kind = kind === 'aww' ? 'aw' : String(kind || '');
      var f = KINDS[kind], v = level(); if (!f || v <= 0) return 0;
      var now = Date.now(); if (!force && now - last < GAP) return 0; // rate limit: about one crowd sound a second
      var c = ctx(); if (!c || c.state === 'closed') return 0;
      if (!force && c.state !== 'running' && !own) return 0;          // a suspended context would play it late, in a heap
      last = now;
      var b = bus(); b.g.gain.setTargetAtTime(own ? 1.1 * v : 1, c.currentTime, 0.02); // shared: the bus applies the volume
      // a per-sound trim node, so overlapping kinds keep their own level
      var tg = c.createGain(); tg.gain.value = KTRIM[kind] || 1; tg.connect(b.g); dst = tg;
      var ms; try { ms = f(c.currentTime + 0.02); } finally { dst = null; }
      setTimeout(function () { try { tg.disconnect(); } catch (e) {} }, ms + 1500);
      return ms;
    } catch (e) { dst = null; return 0; }
  }
  return { play: play, kinds: Object.keys(KINDS), GAP: GAP, _ctx: function () { return ac; }, _trim: KTRIM };
})();

// Game code calls this: the crowd reacts in 3D (if the 3D table is on) and makes the matching sound.
// kind: 'clap' (ordinary move), 'ooh' (clever move), 'gasp' (a challenge), 'cheer' (win / Goal set / correct
// Solution; opts.wave also sends a wave round the stands), 'aw' (lost a shake). Returns true if anything happened.
function crowdReact(kind, opts) {
  try {
    if (typeof S !== 'undefined' && S && S.set && S.set.crowd === false) return false;
    var seen = false;
    if (typeof T3 !== 'undefined' && T3 && typeof T3.crowd === 'function' && (!T3.active || T3.active())) seen = !!T3.crowd(kind, opts || {});
    var heard = CrowdSfx.play(kind) > 0;
    return seen || heard;
  } catch (e) { return false; }
}
