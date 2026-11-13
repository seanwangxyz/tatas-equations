'use strict';
// ======================= MATCH-DAY SOUNDS (classic script) =======================
// Synthesised with the Web Audio API (no audio files), all original: a short walk-out fanfare, the coin's ting and
// the little clinks of it settling, a red cube landing, a "ta-da" for the toss result and the trophy-lift fanfare.
// Never throws; each call returns the length in ms (0 if nothing played).
//   MdSfx.walkout()          ~3.2 s brass-like fanfare over a soft drum roll (the players walk out)
//   MdSfx.flip()             the coin leaves the thumb: a bright metallic ting and a small whoosh
//   MdSfx.clink(v)           the coin touching the felt (v 0..1: how hard); the settling rattle is a few of these
//   MdSfx.cube(v)            a red cube landing on the felt (soft knock)
//   MdSfx.result()           "ta-da" (two rising notes and a sparkle) when the toss is decided
//   MdSfx.trophy()           ~3 s fanfare for the trophy lift (a different tune), with a cymbal swell
//   MdSfx.level()            0..1, the level the sounds play at right now (0 = muted)
// Honours S.set.mute and the S.set.sfx volume (0..1, default 0.8), like js/sound.js. Uses js/sound.js's shared context and
// Snd.bus('sfx') when they exist (typeof Snd.context === 'function'); otherwise its own context (the same pattern as
// js/fx-sfx.js / js/crowd-sfx.js), unlocked by the first tap or key; its output goes through a gentle
// low-pass and a soft compressor, so nothing is sharp or loud.
var MdSfx = (function () {
  var ac = null, out = null, noise = null;
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function level() {
    var st = setg(); if (st.mute) return 0;
    var v = st.sfx; v = (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : 0.8;
    return v;
  }
  function shared() { return typeof Snd !== 'undefined' && Snd && typeof Snd.context === 'function' && typeof Snd.bus === 'function'; }
  function ctx() {
    if (shared()) { try { var sc = Snd.context(); if (sc) return sc; } catch (e) {} }   // main's one shared AudioContext (js/sound.js)
    if (!ac) {
      var AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      try { ac = new AC(); } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended' && ac.resume) { try { var p = ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    return ac;
  }
  if (typeof document !== 'undefined') {
    ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { if (level() > 0) ctx(); }, { passive: true }); });
    document.addEventListener('visibilitychange', function () { try { if (!ac) return; var p = document.hidden ? ac.suspend() : ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} });
  }
  function bus(c) {
    // the shared sound system: a fresh gain into Snd.bus('sfx') for every sound (the bus applies the volume and mute)
    if (shared() && c !== ac) { try { var b = Snd.bus('sfx'); if (b) { var g0 = c.createGain(); g0.gain.value = 0.7; g0.connect(b); return g0; } } catch (e) {} }
    if (!out || out.ctx !== c) {
      var g = c.createGain(), lp = c.createBiquadFilter(), cp = c.createDynamicsCompressor();
      lp.type = 'lowpass'; lp.frequency.value = 6500; lp.Q.value = 0.3;
      cp.threshold.value = -16; cp.knee.value = 10; cp.ratio.value = 4; cp.attack.value = 0.006; cp.release.value = 0.25;
      g.connect(lp); lp.connect(cp); cp.connect(c.destination);
      out = { ctx: c, g: g };
    }
    out.g.gain.value = level() * 0.7;
    return out.g;
  }
  function noiseBuf(c) {
    if (noise && noise.ctx === c) return noise.b;
    var sr = c.sampleRate, b = c.createBuffer(1, Math.floor(sr * 2), sr), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise = { ctx: c, b: b }; return b;
  }
  var NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5 };
  // a soft brass-ish note: two detuned saws through a low-pass that opens with the attack
  function brass(c, d, t, f, dur, vol) {
    var lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.linearRampToValueAtTime(f * 5, t + 0.06); lp.frequency.exponentialRampToValueAtTime(f * 2.4, t + Math.max(0.12, dur));
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.035); g.gain.setValueAtTime(vol, t + Math.max(0.04, dur - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18);
    [-6, 6].forEach(function (cents) {
      var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.25);
    });
    lp.connect(g); g.connect(d);
  }
  function noiseHit(c, d, t, dur, f, q, vol, type) {
    var s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf(c); bp.type = type || 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(d); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function drumRoll(c, d, t, dur, vol) {   // soft timpani-like roll that swells
    for (var k = 0; k < dur / 0.07; k++) {
      var tt = t + k * 0.07, v = vol * (0.35 + 0.65 * (k * 0.07 / dur));
      var o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(92, tt); o.frequency.exponentialRampToValueAtTime(70, tt + 0.2);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(v, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.22);
      o.connect(g); g.connect(d); o.start(tt); o.stop(tt + 0.25);
    }
  }
  function swell(c, d, t, dur, vol) {      // a cymbal swell: high noise rising, then a soft crash
    var s = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf(c); s.loop = true; hp.type = 'highpass'; hp.frequency.value = 5000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4);
    s.connect(hp); hp.connect(g); g.connect(d); s.start(t); s.stop(t + dur + 1.5);
  }
  function ting(c, d, t, vol, base) {     // a coin: inharmonic partials, quick decay
    [[1, 1, 0.9], [2.76, 0.5, 0.55], [5.4, 0.25, 0.3], [8.9, 0.12, 0.18]].forEach(function (p) {
      if (base * p[0] > Math.min(18000, c.sampleRate * 0.45)) return;         // nothing above hearing / the Nyquist limit
      var o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = base * p[0];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * p[1], t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
      o.connect(g); g.connect(d); o.start(t); o.stop(t + p[2] + 0.05);
    });
  }
  function play(fn, ms) {
    try { if (!(level() > 0)) return 0; var c = ctx(); if (!c) return 0; fn(c, bus(c), c.currentTime + 0.02); return ms; } catch (e) { return 0; }
  }
  return {
    level: level,
    walkout: function () {
      return play(function (c, d, t) {
        drumRoll(c, d, t, 1.05, 0.16);
        // an original call: up a fourth, a turn, a leap, then a held top note over a bright chord
        var m = [[0, 'G4', 0.16], [0.2, 'G4', 0.1], [0.32, 'C5', 0.34], [0.72, 'E5', 0.16], [0.9, 'D5', 0.16], [1.08, 'G5', 0.5], [1.7, 'A5', 0.13], [1.85, 'G5', 0.13], [2.0, 'E5', 0.13], [2.16, 'C6', 0.95]];
        m.forEach(function (n) { brass(c, d, t + n[0], NOTE[n[1]], n[2], 0.11); });
        ['C5', 'E5', 'G5'].forEach(function (n) { brass(c, d, t + 2.16, NOTE[n] / 2, 0.95, 0.06); });
        swell(c, d, t + 1.2, 0.95, 0.05);
        noiseHit(c, d, t + 2.16, 0.9, 7000, 0.6, 0.06, 'highpass');
      }, 3300);
    },
    flip: function () {
      return play(function (c, d, t) { ting(c, d, t, 0.22, 2350); noiseHit(c, d, t + 0.02, 0.35, 1800, 0.8, 0.05); }, 600);
    },
    clink: function (v) {
      v = v == null ? 0.6 : Math.max(0.05, Math.min(1, v));
      return play(function (c, d, t) { ting(c, d, t, 0.16 * v, 2100 + Math.random() * 300); noiseHit(c, d, t, 0.06, 3500, 1.5, 0.05 * v); }, 400);
    },
    cube: function (v) {
      v = v == null ? 0.7 : Math.max(0.1, Math.min(1, v));
      return play(function (c, d, t) {
        var o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.12);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.2);
        noiseHit(c, d, t, 0.08, 1200, 1.2, 0.12 * v);
      }, 250);
    },
    result: function () {
      return play(function (c, d, t) {
        brass(c, d, t, NOTE.G5, 0.12, 0.09); brass(c, d, t + 0.14, NOTE.C6, 0.45, 0.1);
        [0, 0.07, 0.15].forEach(function (k, i) { ting(c, d, t + 0.16 + k, 0.05, 3000 + i * 600); });
      }, 900);
    },
    trophy: function () {
      return play(function (c, d, t) {
        drumRoll(c, d, t, 1.3, 0.15);
        swell(c, d, t + 0.2, 1.15, 0.06);
        // a different original tune: a rising arpeggio that lands on a long chord at the lift
        var m = [[0.0, 'C5', 0.14], [0.16, 'E5', 0.14], [0.32, 'G5', 0.14], [0.5, 'E5', 0.12], [0.66, 'G5', 0.14], [0.84, 'C6', 0.3], [1.35, 'B5', 0.16], [1.53, 'C6', 1.3]];
        m.forEach(function (n) { brass(c, d, t + n[0], NOTE[n[1]], n[2], 0.1); });
        ['C5', 'E5', 'G5', 'C4'].forEach(function (n) { brass(c, d, t + 1.35, NOTE[n] / 2, 1.5, 0.055); });
        noiseHit(c, d, t + 1.35, 1.4, 7000, 0.6, 0.08, 'highpass');
      }, 3200);
    }
  };
})();
