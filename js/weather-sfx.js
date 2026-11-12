'use strict';
// ======================= WEATHER AMBIENCE (classic script) =======================
// WeatherSfx.set(kind)  kind: 'rain' | 'wind' | 'off' (or '' / null = off). A very quiet looping bed under the
//   game's own sounds: soft rain (filtered noise, steady) or a soft wind (low noise, slowly breathing in and out).
//   Synthesised with the Web Audio API (no audio files). Fades in and out over about two seconds; changing kind
//   cross-fades. Honours S.set.mute and the S.set.sfx volume (0..1, default 0.8); call WeatherSfx.refresh() after
//   the volume or mute changes (or just call set() again). Uses the game's audio context if js/sound.js exposes one
//   (Snd.context() / Snd.ctx), otherwise makes its own, unlocked by the first tap or key press (iPad Safari).
//   T3.matchWeather() / T3.weather() return the kind to use as .ambience ('rain', 'wind' or '').
var WeatherSfx = (function () {
  var ac = null, own = false, bed = null, want = 'off', hooked = false, noise = null;
  var LEVEL = { rain: 0.05, wind: 0.035 };
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function vol() { var st = setg(); if (st.mute) return 0; var v = st.sfx; return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : 0.8; }
  function shared() {
    try { if (typeof Snd === 'undefined' || !Snd) return null; var c = typeof Snd.context === 'function' ? Snd.context() : Snd.ctx; return c && c.createGain ? c : null; } catch (e) { return null; }
  }
  function ctx() {
    var c = shared();
    if (c && c !== ac) { stopBed(true); ac = c; own = false; noise = null; }
    if (!ac) { var AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!AC) return null; try { ac = new AC(); own = true; } catch (e) { ac = null; return null; } }
    if (ac.state === 'suspended' && ac.resume) { try { var p = ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    return ac;
  }
  function hook() {
    if (hooked || typeof document === 'undefined') return; hooked = true;
    ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { if (want !== 'off' && !bed) sync(); }, { passive: true }); });
    document.addEventListener('visibilitychange', function () { try { if (!ac || !own) return; var p = document.hidden ? ac.suspend() : ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} });
  }
  hook();
  function noiseBuf() {
    if (noise && noise.ctx === ac) return noise.b;
    var sr = ac.sampleRate, b = ac.createBuffer(1, Math.floor(sr * 4), sr), d = b.getChannelData(0), b0 = 0, b1 = 0, b2 = 0;
    for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } // pink-ish
    noise = { ctx: ac, b: b }; return b;
  }
  function stopBed(now) {
    var b = bed; if (!b) return; bed = null;
    try { var t = b.c.currentTime; b.out.gain.cancelScheduledValues(t); b.out.gain.setTargetAtTime(0, t, now ? 0.05 : 0.6); b.nodes.forEach(function (n) { if (n.stop) { try { n.stop(t + (now ? 0.3 : 3)); } catch (e) {} } }); setTimeout(function () { try { b.out.disconnect(); } catch (e) {} }, now ? 500 : 3500); } catch (e) {}
  }
  function startBed(kind) {
    var c = ac, t = c.currentTime, out = c.createGain(), nodes = [];
    out.gain.value = 0.0001; out.connect(c.destination);
    var s = c.createBufferSource(); s.buffer = noiseBuf(); s.loop = true; nodes.push(s);
    if (kind === 'rain') { // a steady, soft hiss: no drips, nothing that ticks
      var hp = c.createBiquadFilter(), lp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500; lp.type = 'lowpass'; lp.frequency.value = 3800; lp.Q.value = 0.4;
      s.connect(hp); hp.connect(lp); lp.connect(out);
    } else { // wind: low rumble that swells very slowly (about a 14 s breath)
      var lp2 = c.createBiquadFilter(), g2 = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      lp2.type = 'lowpass'; lp2.frequency.value = 420; lp2.Q.value = 0.6; g2.gain.value = 0.75;
      lfo.frequency.value = 0.07; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g2.gain); lfo.start(t); nodes.push(lfo);
      s.connect(lp2); lp2.connect(g2); g2.connect(out);
    }
    s.start(t, Math.random() * 3);
    bed = { kind: kind, c: c, out: out, nodes: nodes };
    out.gain.setTargetAtTime((LEVEL[kind] || 0.03) * vol(), t, 0.7);
  }
  function sync() {
    try {
      var on = want !== 'off' && vol() > 0;
      if (!on) { stopBed(false); return; }
      var c = ctx(); if (!c || c.state === 'closed') return;
      if (bed && bed.kind === want) { bed.out.gain.setTargetAtTime((LEVEL[want] || 0.03) * vol(), c.currentTime, 0.3); return; }
      stopBed(false); startBed(want);
    } catch (e) {}
  }
  return {
    set: function (kind) { want = kind === 'rain' || kind === 'wind' ? kind : 'off'; sync(); return want; },
    refresh: sync,
    kind: function () { return bed ? bed.kind : 'off'; }
  };
})();
