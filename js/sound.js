'use strict';
// ======================= SOUND (Web Audio, synthesized; optional sample layer) =======================
// Public API (all safe to call at any time, never throw):
//   init, apply, musicOn, musicOff, setMood('menu'|'play'|'challenge'|'win'|'off'), getMood,
//   diceHit(v), cupRattle, clatter, pickup, thunk, click, pop, chime, boop, slam, fanfare, crowd, whistle,
//   speak(text, who), stopSpeak
// Character voices and atmosphere (each returns a duration in ms, 0 if nothing played; never throws):
//   babble(text, who), stopBabble(), talk(text, who)   gibberish "talking" voice; talk() picks real speech or babble
//   crowdReact('ooh'|'aww'|'cheer'|'gasp'|'laugh'|'clap'|'chant'|'roar'), ambience('stadium'|'room'|'off')
//   theme(who), danceMusic(ms), stopDance(), sting('card'|'vs'|'emote'|'levelup')
//   setMood also accepts 'think' (sparse, calm bed for working out a Solution)
// Recorded sounds can be dropped into assets/audio/ (see assets/audio/README.md): any name listed in
// assets/audio/manifest.json is played from the file; otherwise the synthesized version plays.
var Snd = (function () {
  var ctx = null, gestured = false, visHooked = false;
  var master, limiter, shaper, sfx, sfxRev, musMix, musRev, revIn, diceBus, stingBus;
  var voiceBus, crowdBus, ambOut, danceMix, danceBus;
  var defDest = null, defRev = null, trims = null;   // while set, synth helpers default to a level-trimmed bus (slam, fanfare)
  var noiseBuf = null, pinkBuf = null, bank = null;
  var voices = 0, diceVoices = 0, created = 0, peakVoices = 0;
  var lastDiceWhen = -1, lastVariant = {};
  var wantedMood = 'off', timer = null, nextBar = 0, barNo = 0, offTimer = null;
  var musVol = 0.3, duckF = 1, duckToken = 0;
  var L = null; // music layers

  // ---------------------------------------------------------------- settings helpers
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function vol(k, d) { var v = setg()[k]; return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : d; }
  function muted() { return !!setg().mute; }
  function sfxOn() { return !!ctx && !muted() && vol('sfx', 0.8) > 0; }
  function musicActive() { return !!ctx && !muted() && vol('music', 0.35) > 0 && wantedMood !== 'off'; }
  function guard(fn) { return function () { try { return fn.apply(null, arguments); } catch (e) { return undefined; } }; }
  function T(d) { return ctx.currentTime + (d || 0); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function pickVariant(key, n) { var i = Math.floor(Math.random() * n); if (n > 1 && i === lastVariant[key]) i = (i + 1) % n; lastVariant[key] = i; return i; }

  // ---------------------------------------------------------------- graph
  function build(c) {
    ctx = c; lastDiceWhen = -1; diceVoices = 0; voices = 0; duckF = 1; sbufs = {}; sloading = {};
    resetExtras();
    var sr = c.sampleRate;
    master = c.createGain(); master.gain.value = 0.8;
    limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.2;
    shaper = c.createWaveShaper();
    var curve = new Float32Array(2048), tn = Math.tanh(0.9) / 0.97;   // output ceiling 0.97 leaves headroom for 2x-oversampling overshoot
    for (var i = 0; i < 2048; i++) { var x = i / 1023.5 - 1; curve[i] = Math.tanh(0.9 * x) / tn; }
    shaper.curve = curve; try { shaper.oversample = '2x'; } catch (e) {}
    master.connect(limiter); limiter.connect(shaper); shaper.connect(c.destination);

    sfx = c.createGain(); sfx.connect(master);
    musMix = c.createGain(); musMix.connect(master);

    // Reverb: generated stereo impulse, darkening as it decays, small pre-delay
    var conv = c.createConvolver(), len = Math.floor(sr * 1.9), ir = c.createBuffer(2, len, sr), pre = Math.floor(sr * 0.012);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch), lp = 0;
      for (var k = 0; k < len; k++) {
        var t = k / len, a = 0.35 + 0.6 * Math.sqrt(t);
        lp += ((Math.random() * 2 - 1) - lp) * (1 - a);
        d[k] = k < pre ? 0 : lp * Math.pow(1 - t, 2.7) * 2.2;
      }
    }
    conv.buffer = ir;
    revIn = c.createGain(); revIn.connect(conv);
    var revOut = c.createGain(); revOut.gain.value = 0.85; conv.connect(revOut); revOut.connect(master);
    sfxRev = c.createGain(); sfxRev.connect(revIn);
    musRev = c.createGain(); musRev.connect(revIn);

    diceBus = mkBus(0.07);
    voiceBus = mkBus(0.1); crowdBus = mkBus(0.3);
    // Per-sound level trims, set from offline loudness measurements (see README). Dry and reverb scale together.
    trims = {};
    Object.keys(TRIM).forEach(function (k) { var d = c.createGain(), r = c.createGain(); d.gain.value = r.gain.value = TRIM[k]; d.connect(sfx); r.connect(sfxRev); trims[k] = { d: d, r: r }; });
    ambOut = c.createGain(); ambOut.gain.value = 1; ambOut.connect(sfx);
    danceMix = c.createGain(); danceMix.gain.value = 0; danceMix.connect(master);
    danceBus = c.createGain(); danceBus.connect(danceMix); var dsr = c.createGain(); dsr.gain.value = 0.3; danceBus.connect(dsr); dsr.connect(revIn);
    stingBus = c.createGain(); stingBus.connect(musMix); var sr2 = c.createGain(); sr2.gain.value = 0.5; stingBus.connect(sr2); sr2.connect(musRev);

    // Noise sources (reused by every hiss)
    noiseBuf = c.createBuffer(1, sr * 2, sr);
    var nd = noiseBuf.getChannelData(0); for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
    pinkBuf = c.createBuffer(1, sr * 4, sr);
    var pd = pinkBuf.getChannelData(0), b0 = 0, b1 = 0, b2 = 0, pk = 0;
    for (var m = 0; m < pd.length; m++) {
      var w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      pd[m] = b0 + b1 + b2 + w * 0.1848; if (Math.abs(pd[m]) > pk) pk = Math.abs(pd[m]);
    }
    for (var q = 0; q < pd.length; q++) pd[q] /= pk;
    // make the loop seamless: crossfade the tail into the head
    var xf = Math.floor(sr * 0.1);
    for (var z = 0; z < xf; z++) { var f = z / xf; pd[z] = pd[z] * f + pd[pd.length - xf + z] * (1 - f); }

    buildMusicGraph();
    bank = makeBank();
    musVol = 0; refreshMus(0);
    applyLevels();
  }

  function mkBus(rev) {
    var g = ctx.createGain(); g.connect(sfx);
    if (rev) { var s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(sfxRev); }
    return g;
  }

  // ---------------------------------------------------------------- init / apply
  function init() {
    gestured = true;
    try {
      if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      build(new AC());
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      if (!visHooked && typeof document !== 'undefined') {
        visHooked = true;
        document.addEventListener('visibilitychange', function () {
          try {
            if (!ctx || !ctx.suspend) return;
            var pr = document.hidden ? ctx.suspend() : (gestured ? ctx.resume() : null);
            if (pr && pr.catch) pr.catch(function () {});
          } catch (e) {}
        });
      }
      loadManifest();
      apply();
    } catch (e) { ctx = null; }
  }
  function apply() {
    try {
      if (!ctx) return;
      var on = !muted();
      master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.03);
      sfx.gain.setTargetAtTime(vol('sfx', 0.8), ctx.currentTime, 0.03);
      sfxRev.gain.setTargetAtTime(vol('sfx', 0.8), ctx.currentTime, 0.03);
      musVol = vol('music', 0.35) * 0.8; refreshMus(0.05);
      if (muted() || vol('sfx', 0.8) <= 0) { stopSpeak(); stopBabble(); }
      syncMusic(); syncAmb();
    } catch (e) {}
  }
  function refreshMus(tc) {
    if (!ctx) return;
    var v = musVol * duckF;
    musMix.gain.setTargetAtTime(v, ctx.currentTime, tc || 0.05);
    musRev.gain.setTargetAtTime(v, ctx.currentTime, tc || 0.05);
    refreshAmb(tc); refreshDance(tc);
  }
  function duck(depth, dur) {
    if (!ctx) return;
    var tok = ++duckToken;
    duckF = depth; refreshMus(0.08);
    setTimeout(function () { if (tok === duckToken) { duckF = 1; refreshMus(0.7); } }, dur * 1000);
  }

  // ---------------------------------------------------------------- voices: notes, noise, buffers
  function track(src, outs) {
    voices++; created++; if (voices > peakVoices) peakVoices = voices;
    src.onended = function () { voices--; for (var i = 0; i < outs.length; i++) { try { outs[i].disconnect(); } catch (e) {} } };
  }
  // Shaped oscillator note. o: {type, f, f2, glide, dur, vol, delay, attack, dest, reverb, filter:{type,f,q,f2}, detune, pan}
  function note(o) {
    if (!ctx) return;
    var t = T(o.delay), osc = ctx.createOscillator(), g = ctx.createGain(), out = g, outs = [osc, g];
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    var a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    if (o.filter) {
      var fl = ctx.createBiquadFilter(); fl.type = o.filter.type; fl.frequency.setValueAtTime(o.filter.f, t);
      if (o.filter.f2) fl.frequency.exponentialRampToValueAtTime(o.filter.f2, t + o.dur);
      fl.Q.value = o.filter.q || 1; g.connect(fl); out = fl; outs.push(fl);
    }
    if (o.pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = o.pan; out.connect(p); out = p; outs.push(p); }
    out.connect(o.dest || defDest || sfx);
    if (o.reverb) { var s = ctx.createGain(); s.gain.value = o.reverb; out.connect(s); s.connect(o.rev || defRev || sfxRev); outs.push(s); }
    track(osc, outs);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  // Filtered noise burst. o: {dur, vol, delay, type, f, f2, q, attack, reverb, dest, pink, pan}
  function hiss(o) {
    if (!ctx) return;
    var t = T(o.delay), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), out = g, outs = [s, f, g];
    s.buffer = o.pink ? pinkBuf : noiseBuf; s.loop = true;
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 2000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q || 1;
    var a = o.attack || 0.003;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g);
    if (o.pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; outs.push(p); }
    out.connect(o.dest || defDest || sfx);
    if (o.reverb) { var r = ctx.createGain(); r.gain.value = o.reverb; out.connect(r); r.connect(o.rev || defRev || sfxRev); outs.push(r); }
    track(s, outs);
    s.start(t, Math.random() * 1.5); s.stop(t + o.dur + 0.05);
  }
  // One-shot buffer. o: {vol, rate, pan, delay, dest, offset}
  function playBuf(buf, o) {
    var t = T(o.delay), s = ctx.createBufferSource(), g = ctx.createGain(), out = g, outs = [s, g];
    s.buffer = buf; if (o.rate) s.playbackRate.value = o.rate;
    g.gain.value = o.vol == null ? 1 : o.vol; s.connect(g);
    if (o.pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; outs.push(p); }
    out.connect(o.dest || defDest || sfx);
    track(s, outs);
    s.start(t, o.offset || 0);
    return s;
  }

  // ---------------------------------------------------------------- procedural buffer bank
  function mkBuf(dur, fn, peak) {
    var sr = ctx.sampleRate, n = Math.max(1, Math.floor(sr * dur)), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    fn(d, sr, n);
    var m = 0, i; for (i = 0; i < n; i++) if (Math.abs(d[i]) > m) m = Math.abs(d[i]);
    var k = m > 0 ? (peak || 0.9) / m : 1; for (i = 0; i < n; i++) d[i] *= k;
    // 2 ms fade-out so no buffer ends on a click
    var fo = Math.min(n, Math.floor(sr * 0.002)); for (i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
    return b;
  }
  function lowpass1(d, a) { var y = 0; for (var i = 0; i < d.length; i++) { y += (d[i] - y) * a; d[i] = y; } }
  // A die striking a surface. kind 'felt' (muffled body) | 'die' (hard plastic clack) | 'soft' (gentle)
  function genHit(kind) {
    var dur = kind === 'die' ? 0.13 : 0.16;
    return mkBuf(dur, function (d, sr, n) {
      var body = kind === 'die' ? rnd(190, 300) : rnd(85, 150), bAmp = kind === 'die' ? 0.35 : 1.0;
      var clickA = kind === 'die' ? 0.8 : (kind === 'soft' ? 0.18 : 0.5), clickLp = kind === 'die' ? 0.7 : 0.3;
      var tickF = rnd(1700, 3300), tickA = kind === 'die' ? 0.55 : (kind === 'soft' ? 0.03 : 0.14), tickDecay = rnd(110, 220);
      var ph = 0, lpn = 0, i;
      for (i = 0; i < n; i++) {
        var t = i / sr, f = body * (1 + 1.3 * Math.exp(-t * 75));
        ph += 2 * Math.PI * f / sr;
        var v = Math.sin(ph) * Math.exp(-t * (kind === 'die' ? 90 : 55)) * bAmp;
        lpn += ((Math.random() * 2 - 1) - lpn) * clickLp;
        v += lpn * Math.exp(-t * 330) * clickA;
        v += (Math.sin(2 * Math.PI * tickF * t) * 1 + Math.sin(2 * Math.PI * tickF * 2.31 * t) * 0.45 + Math.sin(2 * Math.PI * tickF * 3.7 * t) * 0.2) * Math.exp(-t * tickDecay) * tickA;
        d[i] = v;
      }
      if (kind === 'soft') lowpass1(d, 0.22);
    });
  }
  function genThunk(f0) {
    return mkBuf(0.34, function (d, sr, n) {
      var ph = 0, lpn = 0;
      for (var i = 0; i < n; i++) {
        var t = i / sr, f = f0 * (1 + 0.45 * Math.exp(-t * 90));
        ph += 2 * Math.PI * f / sr;
        var v = Math.sin(ph) * Math.exp(-t * 17) + Math.sin(2 * Math.PI * f0 * 2.76 * t) * 0.38 * Math.exp(-t * 34) + Math.sin(2 * Math.PI * f0 * 5.4 * t) * 0.16 * Math.exp(-t * 70);
        v += Math.sin(2 * Math.PI * 62 * t) * 0.55 * Math.exp(-t * 26);
        lpn += ((Math.random() * 2 - 1) - lpn) * 0.18;
        v += lpn * Math.exp(-t * 260) * 0.6;
        d[i] = v;
      }
    });
  }
  function genClick(f) {
    return mkBuf(0.08, function (d, sr, n) {
      var lpn = 0;
      for (var i = 0; i < n; i++) {
        var t = i / sr;
        lpn += ((Math.random() * 2 - 1) - lpn) * 0.45;
        d[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 75) + Math.sin(2 * Math.PI * f * 2.5 * t) * 0.3 * Math.exp(-t * 150) + lpn * Math.exp(-t * 480) * 0.3;
      }
    }, 0.8);
  }
  function genPop() {
    return mkBuf(0.14, function (d, sr, n) {
      var ph = 0, lpn = 0;
      for (var i = 0; i < n; i++) {
        var t = i / sr, f = 360 + 760 * (1 - Math.exp(-t * 55));
        ph += 2 * Math.PI * f / sr;
        var env = Math.min(1, t / 0.003) * Math.exp(-t * 38);
        lpn += ((Math.random() * 2 - 1) - lpn) * 0.5;
        d[i] = Math.sin(ph) * env + lpn * Math.exp(-t * 400) * 0.12;
      }
    }, 0.8);
  }
  function genPickup() {
    return mkBuf(0.26, function (d, sr, n) {
      var lp = 0, ph = 0;
      for (var i = 0; i < n; i++) {
        var t = i / sr, u = t / 0.26, a = 0.04 + 0.3 * u;
        lp += ((Math.random() * 2 - 1) - lp) * a;
        var env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.02)), 2);
        var v = lp * env * 0.9;
        ph += 2 * Math.PI * (520 + 160 * u) / sr;
        v += Math.sin(ph) * Math.exp(-t * 60) * 0.2;
        d[i] = v;
      }
    }, 0.7);
  }
  function genKick() {
    return mkBuf(0.32, function (d, sr, n) {
      var ph = 0;
      for (var i = 0; i < n; i++) { var t = i / sr, f = 46 + 90 * Math.exp(-t * 28); ph += 2 * Math.PI * f / sr; d[i] = Math.sin(ph) * Math.exp(-t * 11) * Math.min(1, t / 0.002); }
    });
  }
  function genTom(f0) {
    return mkBuf(0.45, function (d, sr, n) {
      var ph = 0, lpn = 0;
      for (var i = 0; i < n; i++) {
        var t = i / sr, f = f0 * (1 + 0.6 * Math.exp(-t * 30)); ph += 2 * Math.PI * f / sr;
        lpn += ((Math.random() * 2 - 1) - lpn) * 0.2;
        d[i] = Math.sin(ph) * Math.exp(-t * 9) * Math.min(1, t / 0.003) + lpn * Math.exp(-t * 120) * 0.25;
      }
    });
  }
  function genBrush() {
    return mkBuf(0.1, function (d, sr, n) {
      var lp = 0;
      for (var i = 0; i < n; i++) { var t = i / sr, w = Math.random() * 2 - 1; lp += (w - lp) * 0.12; d[i] = (w - lp) * Math.sin(Math.PI * Math.min(1, t / 0.1)) * Math.exp(-t * 28); }
    });
  }
  // Leather cup with dice inside: three shakes, each a burst of clicks over a rustle
  function genCup(hits) {
    var dur = 0.78;
    return mkBuf(dur, function (d, sr, n) {
      var shakes = [0.02, 0.2 + rnd(0, 0.04), 0.4 + rnd(0, 0.05), 0.58 + rnd(0, 0.04)], i, s, c;
      var lp1 = 0, lp2 = 0;
      for (i = 0; i < n; i++) {
        var t = i / sr, e = 0;
        for (s = 0; s < shakes.length; s++) e += Math.exp(-Math.pow((t - shakes[s] - 0.03) / 0.035, 2));
        var w = Math.random() * 2 - 1; lp1 += (w - lp1) * 0.35; lp2 += (w - lp2) * 0.06;
        d[i] = (lp1 - lp2) * e * 0.5;
      }
      for (s = 0; s < shakes.length; s++) {
        var cnt = 4 + Math.floor(Math.random() * 4);
        for (c = 0; c < cnt; c++) {
          var src = hits[Math.floor(Math.random() * hits.length)], off = Math.floor((shakes[s] + Math.random() * 0.07) * sr), g = rnd(0.25, 0.8) * (1 - s * 0.12), sd = src.getChannelData(0);
          for (i = 0; i < sd.length && off + i < n; i++) d[off + i] += sd[i] * g;
        }
      }
    }, 0.85);
  }
  function genAudience() {
    // Dense random hand-claps: little band-passed noise bursts, density ramps up then stays
    return mkBuf(4, function (d, sr, n) {
      var i, c;
      for (c = 0; c < 900; c++) {
        var u = Math.pow(Math.random(), 0.7), at = Math.floor(u * (n - 2000)), len = Math.floor(sr * rnd(0.004, 0.012)), a = rnd(0.2, 1), lp = 0, lp2 = 0;
        for (i = 0; i < len; i++) { var w = Math.random() * 2 - 1; lp += (w - lp) * 0.5; lp2 += (w - lp2) * 0.08; d[at + i] += (lp - lp2) * a * Math.exp(-i / (len * 0.35)); }
      }
    }, 0.8);
  }
  // A small group of people clapping together (a few claps within ~20 ms): one beat of a clapped chant
  function genGroupClap() {
    return mkBuf(0.14, function (d, sr, n) {
      for (var c = 0; c < 9; c++) {
        var at = Math.floor(rnd(0, 0.02) * sr), len = Math.floor(sr * rnd(0.005, 0.012)), a = rnd(0.4, 1), lp = 0, lp2 = 0;
        for (var i = 0; i < len && at + i < n; i++) { var w = Math.random() * 2 - 1; lp += (w - lp) * 0.5; lp2 += (w - lp2) * 0.07; d[at + i] += (lp - lp2) * a * Math.exp(-i / (len * 0.35)); }
      }
    }, 0.8);
  }
  function makeBank() {
    var b = { felt: [], die: [], soft: [], thunk: [], click: [], cup: [], pickup: [] }, i;
    for (i = 0; i < 6; i++) b.felt.push(genHit('felt'));
    for (i = 0; i < 6; i++) b.die.push(genHit('die'));
    for (i = 0; i < 4; i++) b.soft.push(genHit('soft'));
    [165, 185, 205].forEach(function (f) { b.thunk.push(genThunk(f)); });
    [1250, 1380, 1500].forEach(function (f) { b.click.push(genClick(f)); });
    for (i = 0; i < 2; i++) b.pickup.push(genPickup());
    for (i = 0; i < 3; i++) b.cup.push(genCup(b.die.concat(b.felt)));
    b.pop = genPop(); b.kick = genKick(); b.tom = genTom(78); b.tomLow = genTom(60); b.brush = genBrush(); b.audience = genAudience();
    b.gclap = [genGroupClap(), genGroupClap(), genGroupClap()];
    return b;
  }

  // ---------------------------------------------------------------- sample layer (optional recorded sounds)
  var SAMPLE_BASE = 'assets/audio/', man = null, manState = 0, sbufs = {}, sloading = {};
  function loadManifest() {
    if (manState || typeof fetch !== 'function') return;
    manState = 1;
    try {
      fetch(SAMPLE_BASE + 'manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        man = (j && j.sounds && typeof j.sounds === 'object') ? j.sounds : null; manState = 2;
        if (man) Object.keys(man).forEach(preload);
      }).catch(function () { manState = 2; });
    } catch (e) { manState = 2; }
  }
  function entry(name) {
    var e = man && man[name]; if (!e) return null;
    if (typeof e === 'string') return { files: [e] };
    if (Array.isArray(e)) return { files: e };
    if (e && Array.isArray(e.files)) return e;
    if (e && typeof e.file === 'string') { var c = {}; for (var k in e) c[k] = e[k]; c.files = [e.file]; return c; }
    return null;
  }
  function preload(name) {
    var e = entry(name); if (!e || !ctx) return;
    e.files.forEach(function (fn) {
      var url = SAMPLE_BASE + fn;
      if (sbufs[url] !== undefined || sloading[url]) return;
      sloading[url] = 1;
      fetch(url).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
        .then(function (b) { sbufs[url] = b; }).catch(function () { sbufs[url] = null; });
    });
  }
  // Plays the recorded version of `name` if one is loaded. Returns true if it did.
  function sample(name, o) {
    if (!man || !ctx) return false;
    var e = entry(name); if (!e) return false;
    var ready = [];
    e.files.forEach(function (fn) { var b = sbufs[SAMPLE_BASE + fn]; if (b) ready.push(b); });
    if (!ready.length) { preload(name); return false; }
    o = o || {};
    var rr = Array.isArray(e.rate) ? e.rate : [0.97, 1.03];
    playBuf(pick(ready), { vol: (o.vol == null ? 1 : o.vol) * (e.gain == null ? 1 : e.gain), rate: rnd(rr[0], rr[1]), pan: o.pan, delay: o.delay, dest: o.dest });
    return true;
  }

  // ---------------------------------------------------------------- sound-effect building blocks
  function bell(f, delay, vol, dur, dest) {
    // inharmonic partials, soft attack, gentle: warm struck-bell feel
    [[1, 1, 1], [2.0, 0.42, 0.7], [2.76, 0.22, 0.5], [4.07, 0.12, 0.33], [5.4, 0.06, 0.22]].forEach(function (p) {
      note({ f: f * p[0], dur: (dur || 1.4) * p[2], vol: (vol || 0.18) * p[1], delay: delay, attack: 0.003, reverb: 0.55, dest: dest });
    });
  }
  function brass(f, delay, dur, vol) {
    if (!ctx) return;
    var t = T(delay), g = ctx.createGain(), fl = ctx.createBiquadFilter(), outs = [g, fl], s, k;
    fl.type = 'lowpass'; fl.Q.value = 1.4;
    fl.frequency.setValueAtTime(550, t); fl.frequency.linearRampToValueAtTime(2800, t + 0.07); fl.frequency.exponentialRampToValueAtTime(1500, t + dur);
    vol = vol || 0.07;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.035); g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.05, dur - 0.08)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    [-9, 0, 9].forEach(function (dt) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(g); outs.push(o);
      o.start(t); o.stop(t + dur + 0.05); track(o, []);
    });
    g.connect(fl); fl.connect(defDest || sfx);
    var r = ctx.createGain(); r.gain.value = 0.4; fl.connect(r); r.connect(defRev || sfxRev); outs.push(r);
    // clean up filter and gain a bit after the last oscillator ends
    setTimeout(function () { for (var i = 0; i < outs.length; i++) { try { outs[i].disconnect(); } catch (e) {} } }, (dur + delay + 0.6) * 1000);
  }
  function timpani(delay, vol) {
    note({ f: 112, f2: 72, dur: 0.7, vol: vol || 0.5, delay: delay, glide: 0.25, reverb: 0.3 });
    note({ f: 56, dur: 0.5, vol: (vol || 0.5) * 0.5, delay: delay, attack: 0.003 });
    hiss({ dur: 0.12, vol: (vol || 0.5) * 0.3, delay: delay, type: 'lowpass', f: 700 });
  }
  function snareRoll(delay, dur, v0, v1) {
    var n = Math.floor(dur / 0.026);
    for (var i = 0; i < n; i++) {
      var u = i / n;
      hiss({ dur: 0.05, vol: v0 + (v1 - v0) * u, delay: delay + i * 0.026 + rnd(0, 0.006), type: 'bandpass', f: 2100 + rnd(-200, 200), q: 0.8, pan: rnd(-0.2, 0.2) });
    }
  }
  function crash(delay, vol, dur) {
    hiss({ dur: dur, vol: vol, delay: delay, type: 'highpass', f: 5500, attack: 0.004, reverb: 0.5 });
    hiss({ dur: dur * 0.7, vol: vol * 0.7, delay: delay, type: 'bandpass', f: 8200, q: 1.5, attack: 0.004, reverb: 0.5 });
  }
  // A choir-ish vowel: sawtooth through two formant band-passes
  var VOW = { ah: [790, 1180], oh: [500, 930], eh: [560, 1850], ee: [330, 2250], oo: [320, 800] };
  function voiceBurst(f, delay, dur, vol, vowel, dest, pan) {
    if (!ctx) return;
    var t = T(delay), o = ctx.createOscillator(), g = ctx.createGain(), fm = VOW[vowel] || VOW.ah, outs = [o, g], out = ctx.createGain(), fi;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f * rnd(0.97, 1.0), t); o.frequency.linearRampToValueAtTime(f * rnd(1.0, 1.06), t + dur * 0.7);
    o.detune.value = rnd(-14, 14);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.1, dur * 0.35)); g.gain.setValueAtTime(vol, t + dur * 0.55); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    for (fi = 0; fi < 2; fi++) { var b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fm[fi] * rnd(0.93, 1.07); b.Q.value = 5; g.connect(b); b.connect(out); outs.push(b); }
    outs.push(out);
    var tail = out;
    if (pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); tail = p; outs.push(p); }
    tail.connect(dest || sfx);
    track(o, outs);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function whistleAt(delay, f, dur, vol) {
    if (!ctx) return;
    var t = T(delay), o = ctx.createOscillator(), m = ctx.createOscillator(), md = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.04, t + dur * 0.3); o.frequency.linearRampToValueAtTime(f * 0.97, t + dur);
    m.frequency.value = rnd(24, 32); md.gain.value = f * 0.035; m.connect(md); md.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.025); g.gain.setValueAtTime(vol, t + dur - 0.04); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfx);
    var r = ctx.createGain(); r.gain.value = 0.35; g.connect(r); r.connect(sfxRev);
    track(o, [o, m, md, g, r]); o.start(t); o.stop(t + dur + 0.05); m.start(t); m.stop(t + dur + 0.05);
    hiss({ dur: dur, vol: vol * 0.25, delay: delay, type: 'bandpass', f: f, q: 6, attack: 0.02 });
  }

  // ---------------------------------------------------------------- effects
  function hit(v, delay) {
    if (!ctx || !bank || !sfxOn()) return;
    v = Math.max(0.06, Math.min(1, +v || 0.5));
    var when = ctx.currentTime + (delay || 0);
    if (when - lastDiceWhen < 0.011 && v < 0.55) return;   // rate limit soft hits that would blur together
    if (diceVoices > 22 && v < 0.6) return;                // voice limit (a pour can fire 50+ hits)
    if (diceVoices > 34) return;
    lastDiceWhen = when;
    var vv = Math.pow(v, 1.15), amp = 0.1 + 0.9 * vv;
    if (sample('diceHit', { vol: amp, delay: delay, pan: rnd(-0.5, 0.5), dest: diceBus })) return;
    var set;
    if (v < 0.3) set = bank.soft; else set = Math.random() < 0.12 + 0.5 * v ? bank.die : bank.felt;
    var key = set === bank.die ? 'd' : (set === bank.soft ? 's' : 'f'), buf = set[pickVariant(key, set.length)];
    var src = playBuf(buf, { vol: amp * 1.3, rate: rnd(0.92, 1.1) * (1 + 0.06 * (v - 0.5)), pan: rnd(-0.5, 0.5), delay: delay, dest: diceBus });
    diceVoices++; var prev = src.onended; src.onended = function () { diceVoices--; prev(); };
  }
  function click() {
    if (!sfxOn()) return;
    if (sample('click', { vol: 0.7 })) return;
    playBuf(bank.click[pickVariant('c', bank.click.length)], { vol: 0.85, rate: rnd(0.96, 1.05) });
  }
  function pop() {
    if (!sfxOn()) return;
    if (sample('pop', { vol: 0.8 })) return;
    playBuf(bank.pop, { vol: 0.75, rate: rnd(0.95, 1.1), dest: mkBusOnce('pop') });
  }
  var onceBuses = {};
  function mkBusOnce(k) { if (!onceBuses[k] || onceBuses[k].ctx !== ctx) { onceBuses[k] = mkBus(0.12); onceBuses[k].ctx = ctx; } return onceBuses[k]; }
  function pickup() {
    if (!sfxOn()) return;
    if (sample('pickup', { vol: 0.6 })) return;
    playBuf(bank.pickup[pickVariant('p', bank.pickup.length)], { vol: 0.45, rate: rnd(0.95, 1.08), pan: rnd(-0.15, 0.15) });
  }
  function thunk() {
    if (!sfxOn()) return;
    if (sample('thunk', { vol: 0.9 })) return;
    playBuf(bank.thunk[pickVariant('t', bank.thunk.length)], { vol: 1.25, rate: rnd(0.94, 1.07), dest: mkBusOnce('thunk') });
    // a tiny felt-on-cube tick on top so it reads as a cube landing in a zone
    playBuf(bank.felt[pickVariant('f', bank.felt.length)], { vol: 0.25, rate: rnd(1.0, 1.2), delay: 0.004 });
  }
  function cupRattle() {
    if (!sfxOn()) return;
    if (sample('cupRattle', { vol: 0.8 })) return;
    playBuf(bank.cup[pickVariant('cup', bank.cup.length)], { vol: 0.7, rate: rnd(0.96, 1.04), dest: mkBusOnce('cup') });
  }
  function clatter() {
    if (!sfxOn()) return;
    if (sample('clatter', { vol: 0.8 })) return;
    // Dice spilling and settling: hits cascade on the audio clock with fading strength and widening gaps
    var t = 0;
    for (var i = 0; i < 16; i++) {
      var u = i / 16;
      hit(Math.max(0.12, (0.95 - u * 0.8) * rnd(0.6, 1)), t);
      t += 0.035 + u * 0.07 + Math.random() * 0.05;
    }
  }
  function chime() {
    if (!sfxOn()) return;
    if (sample('chime', { vol: 0.9 })) return;
    [784, 988, 1175, 1568].forEach(function (f, i) { bell(f, i * 0.09, 0.15, 1.7); });
    hiss({ dur: 0.9, vol: 0.015, delay: 0.25, type: 'highpass', f: 6500, attack: 0.1, reverb: 0.4 });
  }
  function boop() {
    if (!sfxOn()) return;
    if (sample('boop', { vol: 0.8 })) return;
    // Soft, rounded two-note "hmm, not quite": wooden-mallet tone, never harsh
    [[392, 0], [330, 0.15]].forEach(function (n) {
      note({ type: 'sine', f: n[0], dur: 0.38, vol: 0.2, delay: n[1], attack: 0.008, reverb: 0.3 });
      note({ type: 'sine', f: n[0] * 2, dur: 0.14, vol: 0.05, delay: n[1], attack: 0.006 });
      note({ type: 'triangle', f: n[0], dur: 0.22, vol: 0.05, delay: n[1], attack: 0.01, filter: { type: 'lowpass', f: 900 } });
    });
  }
  function slam() {
    if (!sfxOn()) return;
    duck(0.45, 2.6);
    if (sample('slam', { vol: 0.95 })) return;
    withTrim('slam', slamBody);
  }
  var TRIM = { slam: 0.4, fanfare: 0.55,
    'theme.sloth': 0.4, 'theme.owl': 0.5, 'theme.wizard': 0.6, 'theme.penguin': 0.9, 'theme.fox': 3.0, 'theme.pip': 2.5,
    'sting.card': 1.2, 'sting.vs': 0.55, 'sting.emote': 2.5, 'sting.levelup': 1.0 };
  // Level trim: slam and fanfare measured about 5 dB hotter than the chime, so they were pulled down (see README)
  function withTrim(k, fn) { var tr = trims && trims[k]; if (tr) { defDest = tr.d; defRev = tr.r; } try { fn(); } finally { defDest = null; defRev = null; } }
  function slamBody() {
    var h = 0.4;
    // riser into the hit
    hiss({ dur: h, vol: 0.22, type: 'bandpass', f: 300, f2: 3200, attack: 0.3, q: 1.1, pink: true });
    note({ f: 80, f2: 160, dur: h, vol: 0.05, attack: 0.3, type: 'sawtooth', filter: { type: 'lowpass', f: 300, f2: 900 } });
    // the hit: sub boom, body, crack, metal tail
    note({ f: 120, f2: 34, dur: 1.1, vol: 0.85, delay: h, glide: 0.5, reverb: 0.3 });
    note({ f: 60, dur: 0.9, vol: 0.5, delay: h, attack: 0.004 });
    hiss({ dur: 0.2, vol: 0.45, delay: h, type: 'lowpass', f: 900 });
    hiss({ dur: 0.05, vol: 0.4, delay: h, type: 'highpass', f: 2500 });
    hiss({ dur: 1.6, vol: 0.14, delay: h, type: 'highpass', f: 5500, reverb: 0.55 });
    // low brass stab on a tense interval (root + tritone, softened)
    [82, 116].forEach(function (f) { brass(f, h, 0.7, 0.06); brass(f * 2, h, 0.6, 0.03); });
  }
  function fanfare() {
    if (!sfxOn()) return;
    duck(0.45, 3.4);
    if (sample('fanfare', { vol: 0.95 })) return;
    withTrim('fanfare', fanfareBody);
  }
  function fanfareBody() {
    var cMaj = [523, 659, 784], i;
    // "da da da DAAA": triplet pickup, held C major, G major lift, final C major with crash
    snareRoll(0, 0.44, 0.05, 0.18);
    [0, 0.14, 0.28].forEach(function (d) { brass(392, d, 0.12, 0.06); });
    cMaj.forEach(function (f) { brass(f, 0.45, 0.55, 0.06); }); brass(131, 0.45, 0.55, 0.07); brass(262, 0.45, 0.55, 0.05);
    [392, 494, 587].forEach(function (f) { brass(f, 1.05, 0.22, 0.055); }); brass(98, 1.05, 0.22, 0.06);
    [523, 659, 784, 1047].forEach(function (f) { brass(f, 1.3, 1.3, f > 1000 ? 0.035 : 0.06); }); brass(131, 1.3, 1.3, 0.08); brass(262, 1.3, 1.3, 0.06);
    timpani(0.45, 0.4); timpani(1.05, 0.3); timpani(1.3, 0.55);
    for (i = 0; i < 6; i++) timpani(1.3 + 0.07 * i, 0.14 + 0.02 * i);
    crash(1.3, 0.14, 1.8);
    crash(0.45, 0.07, 0.9);
  }
  function crowd() {
    if (!sfxOn()) return;
    duck(0.4, 6);
    if (sample('crowd', { vol: 0.9 })) return;
    var D = 6, t0 = T(0), i, bus = ctx.createGain(); bus.gain.value = 1; bus.connect(sfx);
    var rv = ctx.createGain(); rv.gain.value = 0.45; bus.connect(rv); rv.connect(sfxRev);
    // roar: looped pink noise through a few vocal-range bands, with slow wobble like a moving crowd
    var roar = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), outs = [roar, lfo, lg, bus, rv];
    roar.gain.setValueAtTime(0.0001, t0); roar.gain.linearRampToValueAtTime(1, t0 + 1.0); roar.gain.setValueAtTime(1, t0 + 3.2); roar.gain.linearRampToValueAtTime(0.0001, t0 + D);
    lfo.frequency.value = 0.9; lg.gain.value = 0.18; lfo.connect(lg); lg.connect(roar.gain);
    roar.connect(bus);
    [[420, 0.9, 0.5], [900, 0.8, 0.45], [1900, 0.9, 0.28], [3600, 0.8, 0.1]].forEach(function (b) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = pinkBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = b[0]; f.Q.value = b[1]; g.gain.value = b[2];
      s.connect(f); f.connect(g); g.connect(roar); s.start(t0, Math.random() * 3); s.stop(t0 + D + 0.1); outs.push(s, f, g);
      track(s, []);
    });
    lfo.start(t0); lfo.stop(t0 + D + 0.1);
    // clapping/applause bed
    var ap = ctx.createBufferSource(), apf = ctx.createBiquadFilter(), apg = ctx.createGain();
    ap.buffer = bank.audience; apf.type = 'bandpass'; apf.frequency.value = 2400; apf.Q.value = 0.6;
    apg.gain.setValueAtTime(0.0001, t0 + 0.6); apg.gain.linearRampToValueAtTime(0.5, t0 + 1.6); apg.gain.setValueAtTime(0.5, t0 + 3.6); apg.gain.linearRampToValueAtTime(0.0001, t0 + D);
    ap.connect(apf); apf.connect(apg); apg.connect(bus); ap.start(t0 + 0.6); outs.push(ap, apf, apg); track(ap, []);
    // individual "aaah / yeah" voices rising at the start
    for (i = 0; i < 16; i++) voiceBurst(rnd(160, 330) * (Math.random() < 0.3 ? 1.5 : 1), rnd(0, 1.6), rnd(0.9, 1.8), 0.012, pick(['ah', 'ah', 'eh', 'oh']), bus, rnd(-0.8, 0.8));
    // a chant: five accented shouts "o-le o-le OH-LE" style, lower in the mix
    var base = 2.1, pat = [0, 0.26, 0.52, 0.78, 1.2], pit = [196, 196, 220, 196, 262];
    pat.forEach(function (p, k) { for (var v = 0; v < 5; v++) voiceBurst(pit[k] * rnd(0.98, 1.02) * (v % 2 ? 2 : 1), base + p + rnd(0, 0.02), k === 4 ? 0.55 : 0.2, k === 4 ? 0.016 : 0.012, k === 4 ? 'oh' : 'eh', bus, rnd(-0.7, 0.7)); });
    // referee-style whistles in the distance
    whistleAt(0.5, 2900, 0.22, 0.03); whistleAt(0.8, 2900, 0.5, 0.03); whistleAt(3.2, 3200, 0.35, 0.025);
    setTimeout(function () { for (var k = 0; k < outs.length; k++) { try { outs[k].disconnect(); } catch (e) {} } }, (D + 1) * 1000);
  }
  function whistle() {
    if (!sfxOn()) return;
    if (sample('whistle', { vol: 0.8 })) return;
    whistleAt(0, 2850, 0.16, 0.05); whistleAt(0.2, 2850, 0.55, 0.05);
  }

  // ---------------------------------------------------------------- adaptive music
  // Layers fade in and out with the mood; everything is scheduled a bar at a time on the audio clock.
  var BPM = 88, BEAT = 60 / BPM, BAR = BEAT * 4, LOOKAHEAD = 1.6;
  var PROG_MAJ = [
    { r: 36, p: [55, 60, 64, 71] }, { r: 33, p: [57, 60, 64, 67] }, { r: 41, p: [53, 60, 64, 69] }, { r: 43, p: [55, 59, 62, 64] },
    { r: 36, p: [55, 60, 64, 71] }, { r: 40, p: [52, 59, 62, 67] }, { r: 41, p: [53, 60, 64, 69] }, { r: 43, p: [55, 59, 62, 64] }
  ];
  var PROG_MIN = [
    { r: 45, p: [57, 60, 64, 69] }, { r: 41, p: [57, 60, 65, 69] }, { r: 38, p: [57, 62, 65, 69] }, { r: 40, p: [56, 59, 64, 68] }
  ];
  var PENT = [0, 2, 4, 7, 9];
  // level of each layer per mood (0..1)
  var MOODS = {
    menu:      { pad: 1.0, pluck: 0.55, bass: 0.0, perc: 0.0, tens: 0.0 },
    play:      { pad: 0.75, pluck: 0.65, bass: 0.6, perc: 0.35, tens: 0.0 },
    think:     { pad: 0.85, pluck: 0.3, bass: 0.3, perc: 0.0, tens: 0.0 },
    challenge: { pad: 0.4, pluck: 0.0, bass: 0.0, perc: 0.0, tens: 0.65 },
    win:       { pad: 0.95, pluck: 0.75, bass: 0.45, perc: 0.3, tens: 0.0 },
    off:       { pad: 0, pluck: 0, bass: 0, perc: 0, tens: 0 }
  };
  var LAYER_REV = { pad: 0.5, pluck: 0.35, bass: 0.04, perc: 0.12, tens: 0.3 };

  function buildMusicGraph() {
    L = {};
    ['pad', 'pluck', 'bass', 'perc', 'tens'].forEach(function (k) {
      var g = ctx.createGain(); g.gain.value = 0; g.connect(musMix);
      var r = ctx.createGain(); r.gain.value = LAYER_REV[k]; g.connect(r); r.connect(musRev);
      L[k] = { out: g, in: g };
    });
    // plucks get a soft dotted-eighth echo
    var pre = ctx.createGain(), dl = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), es = ctx.createGain();
    dl.delayTime.value = BEAT * 0.75; fb.gain.value = 0.36; lp.type = 'lowpass'; lp.frequency.value = 1500; es.gain.value = 0.42;
    pre.connect(L.pluck.out); pre.connect(es); es.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(L.pluck.out);
    L.pluck.in = pre;
  }
  function applyLevels() {
    if (!ctx || !L) return;
    var m = MOODS[wantedMood] || MOODS.off, on = musicActive(), now = ctx.currentTime;
    for (var k in L) L[k].out.gain.setTargetAtTime(on ? m[k] : 0, now, on ? 0.55 : 0.12);
  }
  function syncMusic() {
    if (!ctx) return;
    musVol = vol('music', 0.35) * 0.8; refreshMus(0.05);
    applyLevels();
    if (musicActive()) {
      if (offTimer) { clearTimeout(offTimer); offTimer = null; }
      startMusic();
    } else {
      if (timer && !offTimer) offTimer = setTimeout(function () { offTimer = null; if (!musicActive()) stopMusic(); }, 3000);
    }
  }
  function startMusic() {
    if (timer) return;
    nextBar = ctx.currentTime + 0.15; tick();
  }
  function stopMusic() { if (timer) { clearTimeout(timer); timer = null; } }
  function tick() {
    timer = null;
    try {
      if (!ctx || !musicActive()) return;
      var now = ctx.currentTime;
      if (nextBar < now) nextBar = now + 0.05;            // after a stall or suspend, restart on the clock
      while (nextBar < now + LOOKAHEAD) { scheduleBar(nextBar, barNo++); nextBar += BAR; }
    } catch (e) {}
    timer = setTimeout(tick, 200);
  }
  // delay arguments for music notes are absolute times, so use a dedicated scheduler
  function mnote(o, t) {
    var osc = ctx.createOscillator(), g = ctx.createGain(), out = g, outs = [osc, g], a = o.attack || 0.01;
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t); if (o.detune) osc.detune.value = o.detune;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    if (o.lp) { var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; fl.Q.value = 0.5; g.connect(fl); out = fl; outs.push(fl); }
    out.connect(o.dest);
    track(osc, outs); osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  function mbuf(buf, t, vol, rate, dest) {
    var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; s.playbackRate.value = rate || 1; g.gain.value = vol; s.connect(g); g.connect(dest);
    track(s, [s, g]); s.start(t);
  }
  function chordTones(c) { var pcs = c.p.map(function (m) { return m % 12; }), out = []; for (var m = 60; m <= 79; m++) if (pcs.indexOf(m % 12) >= 0 || PENT.indexOf(m % 12) >= 0) out.push(m); return out; }
  var walk = 7;
  function scheduleBar(t, bar) {
    var mood = wantedMood, lv = MOODS[mood] || MOODS.off, minor = mood === 'challenge';
    var prog = minor ? PROG_MIN : PROG_MAJ, c = prog[bar % prog.length], E = BEAT / 2, i, k;
    // pad: soft triangle + quiet octave sine through a slow low-pass, long overlap between chords
    if (lv.pad > 0.02) {
      var pg = ctx.createGain(), pf = ctx.createBiquadFilter(), len = BAR + 1.4, pouts = [pg, pf];
      pf.type = 'lowpass'; pf.Q.value = 0.4; pf.frequency.setValueAtTime(600, t); pf.frequency.linearRampToValueAtTime(minor ? 800 : 1100, t + BAR * 0.6); pf.frequency.linearRampToValueAtTime(650, t + len);
      pg.gain.setValueAtTime(0.0001, t); pg.gain.linearRampToValueAtTime(1, t + 0.9); pg.gain.setValueAtTime(1, t + BAR - 0.1); pg.gain.linearRampToValueAtTime(0.0001, t + len);
      pg.connect(pf); pf.connect(L.pad.in);
      c.p.forEach(function (m, idx) {
        var f = mtof(m), v = idx === 0 ? 0.03 : 0.024;
        [['triangle', f, v, -4], ['sine', f * 2, v * 0.35, 5], ['sine', f, v * 0.6, 3]].forEach(function (d) {
          var o = ctx.createOscillator(), og = ctx.createGain(); o.type = d[0]; o.frequency.value = d[1]; o.detune.value = d[3]; og.gain.value = d[2];
          o.connect(og); og.connect(pg); o.start(t); o.stop(t + len + 0.05); track(o, [o, og]);
        });
      });
      // release the shared filter nodes once the oscillators have ended
      setTimeout(function () { for (var q = 0; q < pouts.length; q++) { try { pouts[q].disconnect(); } catch (e) {} } }, (len + 0.4) * 1000);
    }
    // bass: root on beat 1 and 3, a soft pickup now and then
    if (lv.bass > 0.02) {
      var rf = mtof(c.r);
      [[0, 1.5, 0.15], [2, 1.2, 0.11]].forEach(function (b) {
        var bt = t + b[0] * BEAT;
        mnote({ type: 'sine', f: rf, dur: b[1] * BEAT, vol: b[2], dest: L.bass.in, attack: 0.012 }, bt);
        mnote({ type: 'triangle', f: rf * 2, dur: b[1] * BEAT * 0.6, vol: b[2] * 0.3, dest: L.bass.in, attack: 0.012, lp: 500 }, bt);
      });
      if (Math.random() < 0.35) mnote({ type: 'sine', f: rf * 1.5, dur: BEAT * 0.6, vol: 0.07, dest: L.bass.in, attack: 0.01 }, t + 3.5 * BEAT);
    }
    // melody: sparse random walk over chord tones + pentatonic, kalimba/marimba-like pluck
    if (lv.pluck > 0.02) {
      var tones = chordTones(c), prob = mood === 'menu' ? 0.22 : (mood === 'think' ? 0.18 : (mood === 'play' ? 0.42 : (mood === 'win' ? 0.5 : 0.55)));
      if (walk >= tones.length) walk = tones.length >> 1;
      for (i = 0; i < 8; i++) {
        var p = prob * (i % 2 === 0 ? 1.25 : 0.7) * (i === 0 ? 1.2 : 1);
        if (Math.random() > p) continue;
        walk = Math.max(0, Math.min(tones.length - 1, walk + pick([-2, -1, -1, 0, 1, 1, 2])));
        var f = mtof(tones[walk]), pt = t + i * E + rnd(-0.008, 0.008), pv = (i % 4 === 0 ? 0.1 : 0.075) * rnd(0.8, 1.15);
        mnote({ type: 'sine', f: f, dur: 1.1, vol: pv, dest: L.pluck.in, attack: 0.004 }, Math.max(t, pt));
        mnote({ type: 'sine', f: f * 4, dur: 0.14, vol: pv * 0.2, dest: L.pluck.in, attack: 0.003 }, Math.max(t, pt));
      }
    }
    // gentle percussion: soft kick, brushed ticks
    if (lv.perc > 0.02) {
      mbuf(bank.kick, t, 0.32, 1, L.perc.in); mbuf(bank.kick, t + 2 * BEAT, 0.26, 1, L.perc.in);
      for (i = 0; i < 8; i++) { if (i === 0 || i === 4) continue; mbuf(bank.brush, t + i * E + rnd(0, 0.008), (i % 2 ? 0.06 : 0.14) * rnd(0.7, 1), rnd(0.95, 1.1), L.perc.in); }
      if (Math.random() < 0.3) mbuf(bank.click[1], t + 3.5 * BEAT, 0.12, 1.2, L.perc.in);
    }
    // tension: low drone, heartbeat, muted minor ostinato (all low-register, never shrill)
    if (lv.tens > 0.02) {
      var tg = ctx.createGain(), tf = ctx.createBiquadFilter(), tlen = BAR + 1.2, df = mtof(c.r);
      tf.type = 'lowpass'; tf.frequency.value = 280; tf.Q.value = 0.6;
      tg.gain.setValueAtTime(0.0001, t); tg.gain.linearRampToValueAtTime(0.055, t + 0.8); tg.gain.setValueAtTime(0.055, t + BAR - 0.1); tg.gain.linearRampToValueAtTime(0.0001, t + tlen);
      tg.connect(tf); tf.connect(L.tens.in);
      [[df, -8, 'sawtooth'], [df, 8, 'sawtooth'], [df * 1.5, 0, 'triangle']].forEach(function (d) {
        var o = ctx.createOscillator(); o.type = d[2]; o.frequency.value = d[0]; o.detune.value = d[1]; o.connect(tg); o.start(t); o.stop(t + tlen + 0.05); track(o, [o]);
      });
      setTimeout(function () { try { tg.disconnect(); tf.disconnect(); } catch (e) {} }, (tlen + 0.4) * 1000);
      [0, 2].forEach(function (b) { mbuf(bank.tom, t + b * BEAT, 0.26, 1, L.tens.in); mbuf(bank.tomLow, t + b * BEAT + 0.2, 0.15, 1, L.tens.in); });
      var seq = [0, 2, 0, 3, 0, 2, 0, 1], on8 = [1, 0, 1, 1, 0, 1, 0, 1];
      for (i = 0; i < 8; i++) if (on8[i]) mnote({ type: 'triangle', f: mtof(c.p[seq[i]]), dur: 0.3, vol: (i === 0 ? 0.06 : 0.04), dest: L.tens.in, attack: 0.006, lp: 800 }, t + i * E);
    }
    // an occasional soft bell in calm moods keeps 20 minutes of music from feeling like a loop
    if ((mood === 'menu' || mood === 'play') && bar % 4 === 3 && Math.random() < 0.5) {
      var tn = chordTones(c), bf = mtof(tn[Math.min(tn.length - 1, tn.length - 2)]);
      mnote({ type: 'sine', f: bf, dur: 2.2, vol: 0.03, dest: L.pluck.in, attack: 0.02 }, t + 2.5 * BEAT);
      mnote({ type: 'sine', f: bf * 2.76, dur: 0.8, vol: 0.008, dest: L.pluck.in, attack: 0.02 }, t + 2.5 * BEAT);
    }
  }
  // Short victory sting (the bed underneath settles into the warm 'win' mix)
  function winSting() {
    if (!ctx || !musicActive()) return;
    var t = ctx.currentTime + 0.06;
    [[392, 0], [523, 0.16], [659, 0.32], [784, 0.5]].forEach(function (n) {
      mnote({ type: 'sine', f: n[0], dur: 1.4, vol: 0.1, dest: stingBus, attack: 0.006 }, t + n[1]);
      mnote({ type: 'sine', f: n[0] * 2.76, dur: 0.5, vol: 0.02, dest: stingBus, attack: 0.004 }, t + n[1]);
      mnote({ type: 'triangle', f: n[0] / 2, dur: 1.0, vol: 0.05, dest: stingBus, attack: 0.02, lp: 900 }, t + n[1]);
    });
    [523, 659, 784].forEach(function (f) { mnote({ type: 'triangle', f: f, dur: 2.2, vol: 0.05, dest: stingBus, attack: 0.15, lp: 1400 }, t + 0.5); });
    mbuf(bank.tom, t + 0.5, 0.35, 1.1, stingBus); mbuf(bank.kick, t, 0.3, 1, stingBus);
  }
  function setMood(m) {
    try {
      m = (typeof m === 'string' && MOODS[m]) ? m : 'off';
      var was = wantedMood; wantedMood = m;
      if (!ctx) return;
      syncMusic();
      if (m === 'win' && was !== 'win') winSting();
    } catch (e) {}
  }
  function musicOn() { try { if (wantedMood === 'off') wantedMood = 'menu'; setMood(wantedMood); } catch (e) {} }
  function musicOff() { setMood('off'); }

  // ---------------------------------------------------------------- speech (Web Speech API)
  var VOICES_CFG = {
    pip:     { pitch: 1.25, rate: 1.0,  g: 'f' },
    sloth:   { pitch: 0.7,  rate: 0.72, g: 'm' },
    penguin: { pitch: 1.12, rate: 1.08, g: 'm' },
    fox:     { pitch: 1.5,  rate: 1.18, g: 'f' },
    owl:     { pitch: 0.85, rate: 0.84, g: 'm' },
    wizard:  { pitch: 0.55, rate: 0.78, g: 'm' }
  };
  var vcache = null, speakToken = 0, speakTimer = null, speaking = 0;
  var FEMALE = /samantha|aria|jenny|zira|karen|moira|tessa|susan|hazel|libby|sonia|female|serena|fiona|victoria|allison|ava|joanna|emma|google uk english female|google us english/i;
  var MALE = /daniel|guy|alex|fred|david|mark|george|ryan|james|thomas|oliver|male|aaron|eric|davis|brian/i;
  var GOOD = /natural|neural|online|google|samantha|aria|jenny|daniel|karen|moira|alex|premium|enhanced/i;
  function loadVoices() {
    try {
      var ss = window.speechSynthesis; if (!ss) return [];
      var vs = ss.getVoices ? ss.getVoices() : []; if (vs && vs.length) vcache = vs; return vcache || [];
    } catch (e) { return []; }
  }
  function chooseVoice(g) {
    var vs = loadVoices().filter(function (v) { return /^en([-_]|$)/i.test(v.lang || ''); });
    if (!vs.length) return null;
    var rx = g === 'f' ? FEMALE : MALE, best = null, bs = -1;
    vs.forEach(function (v) {
      var s = 0, n = v.name || '';
      if (rx.test(n)) s += 4;
      if (g === 'f' && MALE.test(n) && !FEMALE.test(n)) s -= 3;
      if (g === 'm' && FEMALE.test(n) && !MALE.test(n)) s -= 3;
      if (GOOD.test(n)) s += 3;
      if (/^en[-_]US/i.test(v.lang)) s += 2; else if (/^en[-_](GB|AU|CA|IE)/i.test(v.lang)) s += 1;
      if (v.localService) s += 0.5;
      if (/espeak|compact|novelty|bad news|bahh|bells|boing|cellos|good news|jester|organ|superstar|trinoids|whisper|zarvox|albert|bubbles/i.test(n)) s -= 6;
      if (s > bs) { bs = s; best = v; }
    });
    return best;
  }
  function cleanForSpeech(text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, ' and ').replace(/&lt;/g, ' less than ').replace(/&gt;/g, ' greater than ').replace(/&[a-z#0-9]+;/gi, ' ');
    try { s = s.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍⃣]/gu, ' '); }
    catch (e) { s = s.replace(/[☀-➿️‍]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g, ' '); }
    s = s.replace(/×|✕|✖/g, ' times ').replace(/÷/g, ' divided by ').replace(/[−–]/g, '-').replace(/(\d)\s*-\s*(?=[\d(])/g, '$1 minus ')
      .replace(/\+/g, ' plus ').replace(/=/g, ' equals ').replace(/√/g, ' square root of ').replace(/\^/g, ' to the power of ').replace(/([\d)])\s*\*\s*(?=[\d(])/g, '$1 times ')
      .replace(/\//g, ' over ').replace(/[*_#`~|]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  function capText(s, max) {
    if (s.length <= max) return s;
    var cut = s.slice(0, max), p = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (p > max * 0.4) return cut.slice(0, p + 1);
    var sp = cut.lastIndexOf(' '); return (sp > 20 ? cut.slice(0, sp) : cut) + '.';
  }
  function stopSpeak() {
    try { speakToken++; if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; } if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }
  function speak(text, who) {
    try {
      if (!gestured || typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') return false;
      if (setg().voice === false || muted()) return false;
      var s = capText(cleanForSpeech(text), 160);
      if (!/[a-z0-9]/i.test(s)) return false;
      stopBabble();
      var cfg = VOICES_CFG[who] || VOICES_CFG.pip, ss = window.speechSynthesis, tok = ++speakToken;
      if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
      try { ss.cancel(); } catch (e) {}
      // Chrome drops a speak() issued in the same tick as cancel(), so wait a beat
      speakTimer = setTimeout(function () {
        speakTimer = null;
        if (tok !== speakToken) return;
        try {
          var u = new window.SpeechSynthesisUtterance(s), v = chooseVoice(cfg.g);
          if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
          u.pitch = cfg.pitch; u.rate = cfg.rate; u.volume = 1;
          u.onstart = function () { if (tok === speakToken) duck(0.55, 12); };
          u.onend = u.onerror = function () { if (tok === speakToken && ctx) { duckToken++; duckF = 1; refreshMus(0.5); } };
          ss.speak(u);
        } catch (e) {}
      }, 60);
      return true;
    } catch (e) { return false; }
  }
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  } catch (e) {}

  // ================================================================ character voices, crowd, themes, stingers
  var gate = {}, curBab = null, amb = null, ambWant = 'off', swellF = 1, swellTok = 0, dance = null, clarWave = null;
  function resetExtras() { gate = {}; curBab = null; amb = null; swellF = 1; if (dance && dance.timer) clearTimeout(dance.timer); dance = null; clarWave = null; }
  // rate limit on the audio clock; true = allowed
  function rl(key, gap) {
    var n = ctx.currentTime, last = gate[key];
    if (last !== undefined && n >= last && n - last < gap) return false;
    gate[key] = n; return true;
  }
  function roomFor(n) { return voices + (n || 1) < 150; }
  function guard0(fn) { return function () { try { return fn.apply(null, arguments) || 0; } catch (e) { return 0; } }; }

  // Sustained shaped note. o: {type|wave, f, f2, glide, dur, vol, delay, att, rel, sus, lp, lp2, vib:[hz,cents], detune, dest, reverb}
  function held(o) {
    if (!ctx) return;
    var t = T(o.delay), osc = ctx.createOscillator(), g = ctx.createGain(), out = g, outs = [osc, g], dur = o.dur, att = Math.min(o.att || 0.02, dur * 0.4);
    var rel = Math.min(o.rel || 0.12, dur * 0.5), relAt = Math.max(t + att + 0.01, t + dur - rel);
    if (o.wave) osc.setPeriodicWave(o.wave); else osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol, t + att);
    g.gain.linearRampToValueAtTime(o.vol * (o.sus || 1), relAt); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    if (o.lp) { var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.6; fl.frequency.setValueAtTime(o.lp, t); if (o.lp2) fl.frequency.linearRampToValueAtTime(o.lp2, t + dur); g.connect(fl); out = fl; outs.push(fl); }
    if (o.vib) { var lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = o.vib[0]; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib[1], t + Math.min(0.4, dur * 0.6)); lf.connect(lg); lg.connect(osc.detune); lf.start(t); lf.stop(t + dur + 0.05); outs.push(lf, lg); track(lf, []); }
    out.connect(o.dest || defDest || sfx);
    if (o.reverb) { var rv = ctx.createGain(); rv.gain.value = o.reverb; out.connect(rv); rv.connect(defRev || sfxRev); outs.push(rv); }
    track(osc, outs); osc.start(t); osc.stop(t + dur + 0.05);
  }
  function clarinetWave() {
    if (!clarWave) { var re = new Float32Array(14), im = new Float32Array(14); for (var h = 1; h < 14; h += 2) im[h] = 1 / h; clarWave = ctx.createPeriodicWave(re, im); }
    return clarWave;
  }
  // Long filtered pink-noise swell. o: {dur, f, f2, q, vol, env:[[0..1 of dur, level 0..1],...], type, delay, dest}
  function bed(o) {
    if (!ctx) return;
    var t = T(o.delay), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), e = o.env, i;
    s.buffer = pinkBuf; s.loop = true; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.linearRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q || 0.8;
    g.gain.setValueAtTime(0.0001, t);
    for (i = 0; i < e.length; i++) g.gain.linearRampToValueAtTime(Math.max(0.0001, e[i][1] * o.vol), t + e[i][0] * o.dur);
    s.connect(f); f.connect(g); g.connect(o.dest || defDest || sfx);
    track(s, [s, f, g]); s.start(t, Math.random() * 3); s.stop(t + o.dur + 0.05);
  }
  // One member of a crowd: sawtooth through two formant filters that glide from vowel v0 to v1
  function person(o) {
    var t = T(o.delay), osc = ctx.createOscillator(), g = ctx.createGain(), m = ctx.createGain(), outs = [osc, g, m], dur = o.dur, att = Math.min(o.att || 0.1, dur * 0.55), i;
    var a = VOW[o.v0 || 'ah'], b = VOW[o.v1 || o.v0 || 'ah'], sc = rnd(0.92, 1.1);
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(o.f0, t); osc.frequency.linearRampToValueAtTime(o.f1 || o.f0, t + dur * 0.9); osc.detune.value = rnd(-12, 12);
    var lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = rnd(4.5, 6.2); lg.gain.value = rnd(8, 20); lf.connect(lg); lg.connect(osc.detune);
    lf.start(t); lf.stop(t + dur + 0.05); outs.push(lf, lg); track(lf, []);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol, t + att); g.gain.setValueAtTime(o.vol, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    for (i = 0; i < 2; i++) { var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.setValueAtTime(a[i] * sc, t); bp.frequency.linearRampToValueAtTime(b[i] * sc, t + dur); g.connect(bp); bp.connect(m); outs.push(bp); }
    m.gain.value = 2;
    var tail = m;
    if (o.pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = o.pan; m.connect(p); tail = p; outs.push(p); }
    tail.connect(o.dest || sfx);
    track(osc, outs); osc.start(t); osc.stop(t + dur + 0.05);
  }
  function crowdOf(n, o) { for (var i = 0; i < n; i++) { var f0 = rnd(o.lo, o.hi); person({ f0: f0, f1: f0 * (o.glide || 1) * rnd(0.97, 1.03), delay: (o.at || 0) + rnd(0, o.spread || 0.2), dur: rnd(o.d0, o.d1), vol: o.vol, v0: o.v0, v1: o.v1, att: o.att, pan: rnd(-0.8, 0.8), dest: o.dest }); } }
  function applause(delay, dur, vol, dest) {
    var t = T(delay), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), att = Math.min(0.15, dur * 0.25), rel = Math.min(0.5, dur * 0.4);
    s.buffer = bank.audience; f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setValueAtTime(vol, t + dur - rel); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfx);
    track(s, [s, f, g]); var span = Math.max(0, 4 - dur - 0.05); s.start(t, Math.min(span, rnd(1.5, 4 - dur))); s.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- babble voices
  var CAP_MS = 2500;
  // base Hz, span (pitch spread), blip/gap seconds, sub/body/shim gains, q and fs (formant sharpness and scale), glide (start-pitch ratio), slow (pause scale), tail (end-of-sentence stretch)
  var BAB = {
    pip:     { base: 640, span: 0.8,  blip: 0.052, gap: 0.04,  wave: 'triangle', saw: 0.6, sub: 0,    body: 0.2, shim: 0,    q: 5,   fs: 1.18, glide: 0.82, vol: 0.5,  slow: 0.8, tail: 1.3 },
    sloth:   { base: 104, span: 0.55, blip: 0.125, gap: 0.095, wave: 'sawtooth', saw: 0.5, sub: 0.45, body: 0.7, shim: 0,    q: 3,   fs: 0.86, glide: 1.1,  vol: 0.35,  slow: 1.6, tail: 1.9 },
    penguin: { base: 360, span: 0.9,  blip: 0.046, gap: 0.032, wave: 'sawtooth', saw: 0.6, sub: 0,    body: 0.15, shim: 0,   q: 5,   fs: 1.1,  glide: 0.9,  vol: 0.55, slow: 0.75, tail: 1.3 },
    fox:     { base: 270, span: 1.05, blip: 0.058, gap: 0.04,  wave: 'sawtooth', saw: 0.8, sub: 0,    body: 0.1, shim: 0,    q: 8,   fs: 1.16, glide: 1.0,  vol: 0.8, slow: 0.9, tail: 1.2 },
    owl:     { base: 196, span: 0.6,  blip: 0.095, gap: 0.07,  wave: 'triangle', saw: 0.3, sub: 0.5,  body: 0.9, shim: 0,    q: 2.5, fs: 0.86, glide: 1.12, vol: 0.3,  slow: 1.2, tail: 1.7 },
    wizard:  { base: 92,  span: 0.7,  blip: 0.11,  gap: 0.08,  wave: 'sawtooth', saw: 0.5, sub: 0.5,  body: 0.5, shim: 0.2,  q: 4,   fs: 0.82, glide: 1.0,  vol: 0.4,  slow: 1.4, tail: 1.8 }
  };
  var PSC = [0, 2, 4, 7, 9, 12, 14, 16];
  var VMAP = { a: 'ah', e: 'eh', i: 'ee', o: 'oh', u: 'oo', y: 'ee' };
  function babbleClean(text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
    try { s = s.replace(new RegExp('[\\p{Extended_Pictographic}\\p{Emoji_Presentation}\\uFE0F\\u200D\\u20E3]', 'gu'), ' '); }
    catch (e) { s = s.replace(/[☀-➿️‍]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g, ' '); }
    return s.replace(/['’]/g, '').replace(/[^a-z0-9.,;:!?… ]/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  // Turns text into a list of blips {t, d, f (Hz), v (vowel), a (accent)} in seconds. Pure, no audio.
  function planBabble(s, cfg) {
    var words = s.split(' '), syl = [], wi, pi, k = 0;
    for (wi = 0; wi < words.length; wi++) {
      var w = words[wi]; if (!w) continue;
      var pm = w.match(/[.,;:!?…]+$/), p = pm ? pm[0].charAt(pm[0].length - 1) : '', core = w.replace(/[^a-z0-9]/gi, '');
      if (p === '…') p = '.';
      var parts = core.match(/\d+|[^aeiouy\d]*[aeiouy]+/gi) || (core ? [core] : []);
      for (pi = 0; pi < parts.length; pi++) {
        var part = parts[pi], c = part.charCodeAt(0) | 32, vm = part.match(/[aeiouy]/i), vc = vm ? vm[0].toLowerCase() : '';
        var vowel = /\d/.test(part.charAt(0)) ? ['oh', 'ah', 'eh', 'ee', 'oo'][(part.charCodeAt(part.length - 1) - 48) % 5] : (VMAP[vc] || ['oo', 'ah', 'oh'][c % 3]);
        syl.push({ h: c * 5 + (vc ? vc.charCodeAt(0) : 3) + k * 3, v: vowel, first: pi === 0, end: pi === parts.length - 1, punct: pi === parts.length - 1 ? p : '', sem: 0, dm: 1, am: 1 });
        k++;
      }
    }
    var n = syl.length, i;
    if (!n) return { n: 0, ms: 0, blips: [] };
    for (i = 0; i < n; i++) { var y = syl[i]; y.sem = PSC[y.h % PSC.length] * cfg.span + (y.first ? 1 : 0); }
    // intonation per sentence: '?' rises over the last three blips, '!' stresses the last, '.' falls, ',' lifts a little
    var start = 0;
    for (i = 0; i < n; i++) {
      var pu = syl[i].punct;
      if (pu === ',' || pu === ';' || pu === ':') { syl[i].sem += 1.5; }
      else if (pu === '?' || pu === '!' || pu === '.') {
        var len = i - start + 1;
        if (pu === '?') { for (var q = 0; q < Math.min(3, len); q++) { syl[i - q].sem += 6 - q * 2.2; } syl[i].dm = 1.25; }
        else if (pu === '!') { syl[i].sem += 3; syl[i].am = 1.4; syl[i].dm = 1.3; if (len > 1) syl[i - 1].sem += 1.5; }
        else { syl[i].sem -= 3; syl[i].dm = cfg.tail; }
        start = i + 1;
      }
    }
    function layout(sc) {
      var t = 0, out = [], j, d, y;
      for (j = 0; j < n; j++) {
        y = syl[j]; d = cfg.blip * (0.9 + 0.2 * ((y.h % 7) / 6)) * y.dm * sc;
        out.push({ t: t, d: d, f: cfg.base * Math.pow(2, y.sem / 12), v: y.v, a: y.am, sem: y.sem });
        t += d + cfg.gap * sc;
        if (y.end) t += cfg.gap * 1.1 * cfg.slow * sc;
        if (y.punct === ',' || y.punct === ';' || y.punct === ':') t += 0.13 * cfg.slow * sc;
        else if (y.punct) t += 0.26 * cfg.slow * sc;
      }
      return out;
    }
    var cap = CAP_MS / 1000, plan = layout(1), last = plan[plan.length - 1];
    if (last.t + last.d > cap) {
      plan = layout(Math.max(0.72, cap / (last.t + last.d)));
      var kept = plan.filter(function (b) { return b.t + b.d <= cap; });
      if (!kept.length) kept = [plan[0]];
      if (kept.length < plan.length) { var e = kept[kept.length - 1]; e.f *= Math.pow(2, -3 / 12); e.d *= cfg.tail; if (e.t + e.d > cap + 0.15) e.d = Math.max(0.04, cap + 0.15 - e.t); }
      plan = kept;
    }
    last = plan[plan.length - 1];
    return { n: plan.length, ms: Math.round((last.t + last.d) * 1000) + 25, blips: plan };
  }
  function stopBabble() {
    var c = curBab; if (!c) return; curBab = null;
    try {
      var n = ctx.currentTime;
      c.eg.gain.cancelScheduledValues(n); c.eg.gain.setTargetAtTime(0.0001, n, 0.012);
      c.oscs.forEach(function (o) { try { o.stop(n + 0.08); } catch (e) {} });
      if (c.tok === duckToken) { duckToken++; duckF = 1; refreshMus(0.4); }
    } catch (e) {}
  }
  // One short pitched blip per syllable, formant-filtered so it sounds like a tiny vowel. Returns the planned length in ms (0 = nothing played).
  function babble(text, who) {
    if (!sfxOn() || !roomFor(12)) return 0;
    var cfg = BAB[who] || BAB.pip, plan = planBabble(babbleClean(text), cfg);
    if (!plan.n) return 0;
    stopBabble();
    var t0 = T(0.02), end = t0 + plan.ms / 1000, main = ctx.createOscillator(), eg = ctx.createGain(), mix = ctx.createGain(), i, b;
    var outs = [main, eg, mix], oscs = [main], bp1 = ctx.createBiquadFilter(), bp2 = ctx.createBiquadFilter(), body = ctx.createBiquadFilter(), bg = ctx.createGain(), sub = null, shim = null;
    main.type = cfg.wave;
    bp1.type = bp2.type = 'bandpass'; bp1.Q.value = bp2.Q.value = cfg.q;
    body.type = 'lowpass'; body.frequency.value = 700; bg.gain.value = cfg.body;
    var mg = ctx.createGain(); mg.gain.value = cfg.saw; main.connect(mg); mg.connect(eg); outs.push(mg, bp1, bp2, body, bg);
    if (cfg.saw < 1) { var sw = ctx.createOscillator(), swg = ctx.createGain(); sw.type = 'sawtooth'; swg.gain.value = 1 - cfg.saw; sw.connect(swg); swg.connect(eg); oscs.push(sw); outs.push(swg); track(sw, [sw]); sw.start(t0); sw.stop(end + 0.1); var swo = sw; }
    if (cfg.sub) { sub = ctx.createOscillator(); var sg = ctx.createGain(); sg.gain.value = cfg.sub; sub.connect(sg); sg.connect(eg); oscs.push(sub); outs.push(sg); track(sub, [sub]); sub.start(t0); sub.stop(end + 0.1); }
    if (cfg.shim) {
      shim = ctx.createOscillator(); var hg = ctx.createGain(), tr = ctx.createOscillator(), trg = ctx.createGain();
      hg.gain.value = cfg.shim; shim.connect(hg); hg.connect(eg); tr.frequency.value = 6.2; trg.gain.value = cfg.shim * 0.8; tr.connect(trg); trg.connect(hg.gain);
      oscs.push(shim, tr); outs.push(hg, tr, trg); track(shim, [shim]); track(tr, [tr]); shim.start(t0); shim.stop(end + 0.1); tr.start(t0); tr.stop(end + 0.1);
    }
    eg.connect(bp1); eg.connect(bp2); eg.connect(body); bp1.connect(mix); bp2.connect(mix); body.connect(bg); bg.connect(mix);
    mix.gain.value = 0.9; mix.connect(voiceBus);
    var att = 0.005 + (who === 'sloth' || who === 'owl' ? 0.01 : 0);
    for (i = 0; i < plan.blips.length; i++) {
      b = plan.blips[i];
      var tt = t0 + b.t, F = VOW[b.v], g0 = cfg.vol * b.a * (b.v === 'oo' || b.v === 'oh' ? 0.9 : 1), gl = Math.min(0.03, b.d * 0.5);
      main.frequency.setValueAtTime(b.f * cfg.glide, tt); main.frequency.exponentialRampToValueAtTime(b.f, tt + gl);
      if (swo) { swo.frequency.setValueAtTime(b.f * cfg.glide, tt); swo.frequency.exponentialRampToValueAtTime(b.f, tt + gl); }
      if (sub) { sub.frequency.setValueAtTime(b.f * 0.5 * cfg.glide, tt); sub.frequency.exponentialRampToValueAtTime(b.f * 0.5, tt + gl); }
      if (shim) { shim.frequency.setValueAtTime(b.f * 3, tt); }
      bp1.frequency.setValueAtTime(F[0] * cfg.fs, tt); bp2.frequency.setValueAtTime(F[1] * cfg.fs, tt);
      eg.gain.setValueAtTime(0.0001, tt); eg.gain.linearRampToValueAtTime(g0, tt + att);
      eg.gain.setValueAtTime(g0 * 0.85, tt + Math.max(att + 0.002, b.d * 0.5)); eg.gain.exponentialRampToValueAtTime(0.0001, tt + b.d);
    }
    track(main, outs); main.start(t0); main.stop(end + 0.1);
    duck(0.6, plan.ms / 1000 + 0.35);
    curBab = { eg: eg, oscs: oscs, tok: duckToken };
    return plan.ms;
  }
  function estSpeechMs(text, who) {
    var s = cleanForSpeech(text), words = s ? s.split(' ').length : 0, cfg = VOICES_CFG[who] || VOICES_CFG.pip;
    return Math.min(12000, Math.round(words / (165 * cfg.rate / 60) * 1000) + 200);
  }
  // Speech if the player turned "read lines aloud" on (and speech works), otherwise babble. Returns ms to animate the mouth.
  function talk(text, who) {
    if (setg().voice === true && speak(text, who)) return estSpeechMs(text, who);
    if (setg().babble !== false) return babble(text, who);
    return 0;
  }

  // ---------------------------------------------------------------- ambience (very quiet looping bed)
  var AMB = { stadium: 0.0125, room: 0.004 };
  function ambTarget() { if (!amb) return 0; return amb.level * (duckF < 1 ? Math.max(0.25, duckF * 0.7) : 1) * swellF; }
  function refreshAmb(tc) { try { if (amb && ctx) amb.out.gain.setTargetAtTime(ambTarget(), ctx.currentTime, tc || 0.3); } catch (e) {} }
  function stopAmb() {
    var a = amb; if (!a) return; amb = null;
    try {
      var now = ctx.currentTime; a.out.gain.setTargetAtTime(0, now, 0.25);
      a.srcs.forEach(function (s) { try { s.stop(now + 1.4); } catch (e) {} });
      setTimeout(function () { try { a.out.disconnect(); } catch (e) {} }, 2000);
    } catch (e) {}
  }
  function startAmb(kind) {
    stopAmb();
    var t = T(0), out = ctx.createGain(), a = { kind: kind, out: out, level: AMB[kind], srcs: [] };
    out.gain.value = 0.0001; out.connect(ambOut);
    function layer(type, f, q, g, lfoHz, depth) {
      var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gg = ctx.createGain(), o2 = [s, fl, gg];
      s.buffer = pinkBuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; gg.gain.value = g;
      s.connect(fl); fl.connect(gg); gg.connect(out);
      if (lfoHz) { var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = lfoHz; lg.gain.value = g * depth; l.connect(lg); lg.connect(gg.gain); l.start(t); o2.push(l, lg); a.srcs.push(l); track(l, [l, lg]); }
      s.start(t, Math.random() * 3); a.srcs.push(s); track(s, o2);
    }
    if (kind === 'stadium') { layer('lowpass', 420, 0.7, 1.0, 0.11, 0.35); layer('bandpass', 1000, 0.5, 0.55, 0.17, 0.4); layer('bandpass', 2600, 0.8, 0.12, 0.23, 0.5); }
    else { layer('lowpass', 200, 0.5, 1.0, 0.07, 0.3); layer('bandpass', 700, 0.4, 0.15, 0.05, 0.3); }
    amb = a; out.gain.setTargetAtTime(ambTarget(), t, 0.9);
  }
  function syncAmb() {
    if (!ctx) return;
    var on = ambWant !== 'off' && !muted() && vol('sfx', 0.8) > 0;
    if (!on) { stopAmb(); return; }
    if (!amb || amb.kind !== ambWant) startAmb(ambWant); else refreshAmb(0.3);
  }
  var ambTimer = null;
  function ambience(kind) {
    ambWant = (kind === 'stadium' || kind === 'room') ? kind : 'off';
    if (!ctx) return;
    // restarts are rate limited (a restart builds a few noise sources); the latest request wins
    if (!rl('amb', 0.4)) { if (ambTimer) clearTimeout(ambTimer); ambTimer = setTimeout(function () { ambTimer = null; try { syncAmb(); } catch (e) {} }, 450); return; }
    syncAmb();
  }
  function ambSwell(mult, dur) {
    if (!amb || amb.kind !== 'stadium') return;
    var tok = ++swellTok; swellF = mult; refreshAmb(0.15);
    setTimeout(function () { if (tok === swellTok) { swellF = 1; refreshAmb(0.8); } }, dur * 1000);
  }

  // ---------------------------------------------------------------- reactive crowd
  var CROWD_MS = { ooh: 1700, aww: 1900, cheer: 1500, gasp: 800, laugh: 2000, clap: 1700, chant: 1600, roar: 6000 };
  var REACT = {
    ooh: function (cb) {   // rising anticipation
      bed({ dur: 1.5, f: 450, f2: 1000, q: 0.9, vol: 0.3, env: [[0, 0], [0.75, 1], [0.85, 0.9], [1, 0]], dest: cb });
      crowdOf(9, { lo: 150, hi: 250, glide: 1.4, spread: 0.25, d0: 1.0, d1: 1.3, vol: 0.05, v0: 'oo', v1: 'oh', att: 0.6, dest: cb });
      ambSwell(1.6, 1.6);
    },
    aww: function (cb) {   // sympathetic, falling, soft
      bed({ dur: 1.7, f: 800, f2: 400, q: 0.8, vol: 0.25, env: [[0, 0], [0.2, 1], [0.55, 0.8], [1, 0]], dest: cb });
      crowdOf(9, { lo: 210, hi: 320, glide: 0.8, spread: 0.2, d0: 1.2, d1: 1.5, vol: 0.048, v0: 'ah', v1: 'oh', att: 0.2, dest: cb });
      ambSwell(1.4, 1.8);
    },
    cheer: function (cb) {
      bed({ dur: 1.3, f: 700, f2: 1500, q: 0.8, vol: 0.33, env: [[0, 0], [0.12, 1], [0.5, 0.9], [1, 0]], dest: cb });
      crowdOf(10, { lo: 180, hi: 340, glide: 1.1, spread: 0.15, d0: 0.7, d1: 1.1, vol: 0.038, v0: 'ah', v1: 'eh', att: 0.1, dest: cb });
      applause(0.1, 0.9, 0.45, cb); ambSwell(1.8, 1.5);
    },
    gasp: function (cb) {  // a quick shared inhale
      bed({ dur: 0.45, f: 800, f2: 2200, q: 0.8, vol: 0.45, env: [[0, 0], [0.5, 1], [0.75, 0.6], [1, 0]], dest: cb });
      crowdOf(7, { lo: 200, hi: 300, glide: 1.2, at: 0.1, spread: 0.08, d0: 0.3, d1: 0.38, vol: 0.07, v0: 'oh', v1: 'oh', att: 0.12, dest: cb });
      ambSwell(1.3, 0.8);
    },
    laugh: function (cb) { // friendly: little "ha ha ha" pulses from several people
      bed({ dur: 1.8, f: 700, f2: 1300, q: 0.8, vol: 0.25, env: [[0, 0], [0.15, 1], [0.6, 0.8], [1, 0]], dest: cb });
      for (var p = 0; p < 7; p++) {
        var t = T(rnd(0, 0.35)), f0 = rnd(190, 330), osc = ctx.createOscillator(), g = ctx.createGain(), m = ctx.createGain(), outs = [osc, g, m], np = 4 + Math.floor(Math.random() * 3), per = rnd(0.17, 0.2), k, i;
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f0, t);
        for (k = 0; k < np; k++) { var tk = t + k * per, v = 0.16 * (1 - 0.12 * k); osc.frequency.setValueAtTime(f0 * (1 - 0.045 * k), tk); g.gain.setValueAtTime(0.0001, tk); g.gain.linearRampToValueAtTime(v, tk + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, tk + 0.1); }
        osc.connect(g);
        for (i = 0; i < 2; i++) { var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.value = VOW.ah[i] * rnd(0.92, 1.08); g.connect(bp); bp.connect(m); outs.push(bp); }
        m.gain.value = 2; var pn = null; if (ctx.createStereoPanner) { pn = ctx.createStereoPanner(); pn.pan.value = rnd(-0.8, 0.8); m.connect(pn); outs.push(pn); }
        (pn || m).connect(cb); track(osc, outs); osc.start(t); osc.stop(t + np * per + 0.1);
      }
      ambSwell(1.5, 1.8);
    },
    clap: function (cb) { applause(0, 1.6, 0.9, cb); ambSwell(1.5, 1.6); },
    chant: function (cb) { // clap, clap, clap, clap, CLAP
      var ts = [0, 0.27, 0.54, 0.81, 1.08], vs = [0.8, 0.7, 0.7, 0.7, 1.0], i;
      for (i = 0; i < 5; i++) {
        playBuf(bank.gclap[i % 3], { vol: vs[i] * 0.7, rate: rnd(0.95, 1.05), delay: ts[i], dest: cb });
        crowdOf(2, { lo: 150, hi: 220, glide: 1, at: ts[i], spread: 0.02, d0: 0.15, d1: 0.18, vol: 0.04, v0: 'oh', v1: 'oh', att: 0.04, dest: cb });
      }
      ambSwell(1.5, 1.7);
    }
  };
  function crowdReact(kind) {
    if (!sfxOn()) return 0;
    kind = String(kind || '');
    if (kind === 'roar') { crowd(); return CROWD_MS.roar; }
    var f = REACT[kind]; if (!f) return 0;
    if (!rl('react', 0.12) || !rl('react.' + kind, 0.35) || !roomFor(45)) return 0;
    if (sample('crowd_' + kind, { vol: 0.9, dest: crowdBus })) return CROWD_MS[kind];
    f(crowdBus); return CROWD_MS[kind];
  }

  // ---------------------------------------------------------------- character themes (2 to 3 second entrance stings)
  function xylo(m, d, v) { var f = mtof(m), b = undefined; note({ f: f, dur: 0.42, vol: v, delay: d, attack: 0.002, dest: b, reverb: 0.2 }); note({ f: f * 3, dur: 0.16, vol: v * 0.3, delay: d, attack: 0.002, dest: b }); note({ f: f * 6, dur: 0.07, vol: v * 0.08, delay: d, attack: 0.002, dest: b }); }
  function pizz(m, d, v) { var f = mtof(m), b = undefined; note({ type: 'sawtooth', f: f, dur: 0.17, vol: v, delay: d, attack: 0.002, filter: { type: 'lowpass', f: 2600, f2: 320, q: 2 }, dest: b, reverb: 0.15 }); note({ type: 'triangle', f: f, dur: 0.12, vol: v * 0.8, delay: d, attack: 0.002, dest: b }); }
  function celesta(m, d, v) { var f = mtof(m), b = undefined; [[1, 1, 1.3], [2, 0.34, 0.8], [3, 0.12, 0.5], [4, 0.09, 0.3]].forEach(function (p) { note({ f: f * p[0], dur: p[2], vol: v * p[1], delay: d, attack: 0.002, dest: b, reverb: 0.55 }); }); }
  function chirp(a, b2, d, dur, v) { var b = undefined; note({ f: a, f2: b2, glide: dur * 0.8, dur: dur, vol: v, delay: d, attack: 0.006, dest: b, reverb: 0.2 }); note({ f: a * 2, f2: b2 * 2, glide: dur * 0.8, dur: dur * 0.8, vol: v * 0.12, delay: d, attack: 0.006, dest: b }); }
  function tubaNote(m, d, dur, v, m2) { var f = mtof(m), o = { f: f, f2: m2 ? mtof(m2) : 0, glide: dur, delay: d, dur: dur, vol: v, att: 0.05, rel: 0.2, lp: 380, lp2: 520, reverb: 0.25 }; o.type = 'sawtooth'; held(o); o.type = 'sine'; o.vol = v * 0.8; o.lp = 0; held(o); }
  var THEMES = {
    sloth: function () {   // lazy tuba: bwomp... bwomp... bwooooomp, then a yawn
      tubaNote(50, 0, 0.45, 0.2); tubaNote(53, 0.58, 0.45, 0.2); tubaNote(50, 1.16, 0.45, 0.2); tubaNote(45, 1.76, 1.0, 0.22, 41);
      bed({ dur: 0.9, f: 520, f2: 300, q: 0.7, vol: 0.05, delay: 1.7, env: [[0, 0], [0.4, 1], [1, 0]] });
      return 2.8;
    },
    penguin: function () { // bouncy xylophone
      [[72, 0], [76, 0.14], [79, 0.28], [76, 0.42], [79, 0.56], [81, 0.7], [79, 0.84], [76, 0.98]].forEach(function (n) { xylo(n[0], n[1], 0.16); });
      [[48, 0], [48, 0.42], [48, 0.84]].forEach(function (n) { note({ f: mtof(n[0]), dur: 0.22, vol: 0.2, delay: n[1], attack: 0.004 }); });
      [79, 84, 88].forEach(function (m) { xylo(m, 1.3, 0.14); }); note({ f: mtof(48), dur: 0.5, vol: 0.2, delay: 1.3 });
      return 2.0;
    },
    fox: function () {     // sneaky pizzicato: tiptoe up the keys, then "ta-da"
      [[57, 0], [58, 0.26], [59, 0.52], [58, 0.78], [60, 1.04], [61, 1.3], [60, 1.56]].forEach(function (n) { pizz(n[0], n[1], 0.09); playBuf(bank.click[0], { vol: 0.08, rate: 0.8, delay: n[1] }); });
      pizz(66, 2.0, 0.1); pizz(69, 2.18, 0.11);
      return 2.7;
    },
    owl: function () {     // warm clarinet-ish hoot motif: hoo, hoo, hooooo
      var w = clarinetWave();
      [[67, 0, 0.3], [67, 0.4, 0.3], [64, 0.85, 1.6]].forEach(function (n, i) {
        held({ wave: w, f: mtof(n[0]), dur: n[2], vol: 0.13, att: 0.045, rel: 0.15, lp: 1700, vib: i === 2 ? [5, 14] : null, reverb: 0.35, sus: 0.85 });
        hiss({ dur: 0.08, vol: 0.02, delay: n[1], type: 'bandpass', f: 1500, q: 0.8 });
      });
      held({ type: 'triangle', f: mtof(48), dur: 2.5, vol: 0.05, att: 0.5, rel: 0.8, lp: 700, reverb: 0.3 });
      held({ type: 'triangle', f: mtof(52), dur: 2.5, vol: 0.035, att: 0.5, rel: 0.8, lp: 700, reverb: 0.3 });
      return 2.6;
    },
    wizard: function () {  // mysterious celesta sparkle over a low drone
      held({ type: 'sine', f: mtof(40), dur: 3.0, vol: 0.12, att: 1.0, rel: 1.0, reverb: 0.4 });
      held({ type: 'triangle', f: mtof(52), dur: 3.0, vol: 0.05, att: 1.0, rel: 1.0, lp: 500, reverb: 0.4 });
      [[64, 0], [67, 0.2], [71, 0.4], [76, 0.6], [79, 0.8]].forEach(function (n) { celesta(n[0], n[1], 0.16); });
      [[83, 1.05], [86, 1.18], [88, 1.31], [91, 1.44], [95, 1.57]].forEach(function (n, i) { celesta(n[0], n[1], 0.1 - i * 0.01); });
      celesta(76, 1.95, 0.16); celesta(83, 1.95, 0.1);
      hiss({ dur: 1.2, vol: 0.012, delay: 1.0, type: 'highpass', f: 5500, attack: 0.5, reverb: 0.5 });
      return 3.0;
    },
    pip: function () {     // cheerful chirps and a little trill
      [[900, 1500, 0, 0.09], [1050, 1700, 0.14, 0.09], [1250, 2000, 0.28, 0.1]].forEach(function (c) { chirp(c[0], c[1], c[2], c[3], 0.16); });
      for (var k = 0; k < 6; k++) chirp(k % 2 ? 1750 : 1450, k % 2 ? 1700 : 1500, 0.55 + k * 0.07, 0.05, 0.12);
      chirp(1300, 2100, 1.05, 0.16, 0.16); chirp(1100, 1800, 1.3, 0.2, 0.14);
      return 1.6;
    }
  };
  function theme(who) {
    if (!sfxOn() || !roomFor(40)) return 0;
    var th = THEMES[who] || THEMES.pip;
    if (!rl('theme', 0.5)) return 0;
    var dur;
    var key = THEMES[who] ? who : 'pip';
    if (sample('theme_' + key, { vol: 0.9 })) dur = 2.5; else { th = THEMES[key]; withTrim('theme.' + key, function () { dur = th(); }); }
    duck(0.5, dur + 0.4);
    return Math.round(dur * 1000);
  }

  // ---------------------------------------------------------------- victory dance loop
  var DCH = [
    { r: 48, p: [64, 67, 72], mel: [[0, 2], [2, 4], [3, 5], [6, 4], [8, 2], [10, 4], [12, 5], [14, 4]] },
    { r: 43, p: [62, 67, 71], mel: [[0, 1], [2, 3], [3, 4], [6, 3], [8, 1], [10, 3], [12, 4], [14, 3]] },
    { r: 45, p: [64, 69, 72], mel: [[0, 2], [2, 4], [3, 5], [6, 4], [8, 5], [10, 4], [12, 2], [14, 0]] },
    { r: 41, p: [65, 69, 72], mel: [[0, 0], [2, 2], [3, 3], [6, 2], [8, 3], [10, 5], [12, 4], [14, 3]] }
  ];
  var DSC = [72, 74, 76, 79, 81, 84, 86, 88];
  function refreshDance(tc) {
    try { if (ctx && danceMix) danceMix.gain.setTargetAtTime((!muted() && vol('music', 0.35) > 0) ? vol('music', 0.35) * 1.0 : 0, ctx.currentTime, tc || 0.1); } catch (e) {}
  }
  function danceBar(d, b) {
    var t = d.t0 + b * d.bar, st = d.bar / 16, c = DCH[b % 4], run = d.run, last = b === d.n - 1, now = ctx.currentTime, i;
    function at(s) { return Math.max(0, t + s * st - now); }
    if (last) {   // the button: one big chord, kick and crash that ring out to the end
      mbuf(bank.kick, Math.max(now, t), 0.45, 1, run);
      [60, 64, 67, 72, 76].forEach(function (m) { held({ type: 'triangle', f: mtof(m), dur: d.bar * 0.9, vol: 0.05, att: 0.01, rel: 0.5, lp: 1900, dest: run }); });
      note({ f: mtof(36), dur: 1.4, vol: 0.28, delay: at(0), attack: 0.006, dest: run });
      note({ f: mtof(72), dur: 0.9, vol: 0.1, delay: at(0), attack: 0.003, dest: run });
      hiss({ dur: 1.2, vol: 0.09, delay: at(0), type: 'highpass', f: 5000, attack: 0.004, dest: run });
      return;
    }
    [[0, 0.34], [4, 0.22], [8, 0.3], [12, 0.22]].forEach(function (k) { mbuf(bank.kick, Math.max(now, t + k[0] * st), k[1], 1, run); });
    for (i = 0; i < 16; i++) { if (i % 2 === 0 && i % 4 !== 2) continue; mbuf(bank.brush, Math.max(now, t + i * st), i % 4 === 2 ? 0.1 : 0.05, 1.5 + rnd(0, 0.1), run); }
    [4, 12].forEach(function (s) { hiss({ dur: 0.07, vol: 0.07, delay: at(s), type: 'bandpass', f: 1700, q: 0.9, dest: run, reverb: 0.3 }); });
    var rf = mtof(c.r);
    [[0, 1, 3], [3, 1, 1.5], [6, 1.5, 2], [8, 1, 3], [11, 1, 1.5], [14, 2, 1.5]].forEach(function (n) {
      note({ f: rf * n[1], dur: n[2] * st * 0.95, vol: n[0] === 0 || n[0] === 8 ? 0.2 : 0.14, delay: at(n[0]), attack: 0.01, dest: run });
      note({ type: 'triangle', f: rf * n[1] * 2, dur: n[2] * st * 0.6, vol: 0.04, delay: at(n[0]), attack: 0.01, filter: { type: 'lowpass', f: 600 }, dest: run });
    });
    [3, 6, 10, 14].forEach(function (s) { c.p.forEach(function (m) { note({ type: 'triangle', f: mtof(m), dur: 0.16, vol: 0.035, delay: at(s), attack: 0.004, filter: { type: 'lowpass', f: 2200 }, dest: run }); }); });
    c.mel.forEach(function (n) { var f = mtof(DSC[n[1]]); note({ f: f, dur: 0.5, vol: 0.075, delay: at(n[0]), attack: 0.003, dest: run, reverb: 0.2 }); note({ f: f * 4, dur: 0.1, vol: 0.016, delay: at(n[0]), attack: 0.003, dest: run }); });
  }
  function danceTick() {
    var d = dance; if (!d) return; d.timer = null;
    try {
      var now = ctx.currentTime;
      while (d.next < d.n && d.t0 + d.next * d.bar < now + 1.2) { danceBar(d, d.next); d.next++; }
      if (d.next >= d.n) { d.timer = setTimeout(function () { if (dance === d) { try { d.run.disconnect(); } catch (e) {} dance = null; } }, Math.max(0, d.end - ctx.currentTime) * 1000 + 800); return; }
    } catch (e) {}
    d.timer = setTimeout(danceTick, 150);
  }
  function stopDance() {
    var d = dance; if (!d) return; dance = null;
    try {
      if (d.timer) clearTimeout(d.timer);
      var now = ctx.currentTime; d.run.gain.cancelScheduledValues(now); d.run.gain.setTargetAtTime(0.0001, now, 0.06);
      setTimeout(function () { try { d.run.disconnect(); } catch (e) {} }, 2500);
      duckToken++; duckF = 1; refreshMus(0.5);
    } catch (e) {}
  }
  // An upbeat samba-ish loop that ends cleanly after about `ms`; ducks the regular music meanwhile. Returns the actual length in ms (0 = not played).
  function danceMusic(ms) {
    if (!ctx || muted() || vol('music', 0.35) <= 0 || !roomFor(60)) return 0;
    ms = +ms; if (!isFinite(ms)) return 0;
    var sec = Math.max(2.5, Math.min(20, ms / 1000));
    stopDance();
    var n = Math.max(2, Math.round(sec / 2)), t0 = ctx.currentTime + 0.08, run = ctx.createGain(), end = t0 + sec;
    run.gain.setValueAtTime(0.0001, t0); run.gain.linearRampToValueAtTime(1, t0 + 0.05); run.gain.setValueAtTime(1, end - 0.35); run.gain.linearRampToValueAtTime(0.0001, end);
    run.connect(danceBus);
    dance = { run: run, t0: t0, end: end, bar: sec / n, n: n, next: 0, timer: null };
    refreshDance(0.05);
    duck(0.2, sec + 0.9);
    danceTick();
    return Math.round(sec * 1000);
  }

  // ---------------------------------------------------------------- tiny UI stingers
  var STINGS = {
    card: function () {    // collectible earned: a little sparkle up
      [880, 1109, 1319, 1760].forEach(function (f, i) { bell(f, i * 0.07, 0.11, 1.1); });
      note({ f: 392, dur: 0.35, vol: 0.14, attack: 0.006 }); hiss({ dur: 0.14, vol: 0.05, type: 'highpass', f: 4000, attack: 0.01 });
      return 1.2;
    },
    vs: function () {      // versus screen: rising whoosh into a firm (not scary) hit
      var h = 0.42;
      hiss({ dur: h, vol: 0.18, type: 'bandpass', f: 250, f2: 3000, attack: 0.34, q: 1.2, pink: true });
      note({ f: 100, f2: 38, dur: 0.9, vol: 0.55, delay: h, glide: 0.35, reverb: 0.25 }); note({ f: 55, dur: 0.6, vol: 0.28, delay: h, attack: 0.004 });
      hiss({ dur: 0.15, vol: 0.3, delay: h, type: 'lowpass', f: 800 }); hiss({ dur: 0.04, vol: 0.2, delay: h, type: 'highpass', f: 2500 });
      brass(98, h, 0.45, 0.045);
      duck(0.55, 1.8);
      return 1.4;
    },
    emote: function () {   // bubbly pop
      note({ f: 480, f2: 900, glide: 0.07, dur: 0.1, vol: 0.2, attack: 0.004 }); note({ f: 620, f2: 1200, glide: 0.07, dur: 0.1, vol: 0.17, delay: 0.075, attack: 0.004 });
      hiss({ dur: 0.02, vol: 0.05, type: 'lowpass', f: 1500 });
      return 0.3;
    },
    levelup: function () { // brighter and longer than a chime, shorter than a fanfare
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { bell(f, i * 0.09, 0.12, 1.3); });
      [523, 659, 784].forEach(function (f) { held({ type: 'triangle', f: f, dur: 1.2, vol: 0.05, delay: 0.45, att: 0.05, rel: 0.5, lp: 1500, reverb: 0.3 }); });
      held({ type: 'sine', f: 131, dur: 1.2, vol: 0.12, delay: 0.45, att: 0.02, rel: 0.5 });
      hiss({ dur: 0.9, vol: 0.02, delay: 0.4, type: 'highpass', f: 5500, attack: 0.1, reverb: 0.4 });
      duck(0.6, 1.8);
      return 1.7;
    }
  };
  function stingKind(kind) {
    if (!sfxOn() || !roomFor(30)) return 0;
    var f = STINGS[kind]; if (!f || !rl('sting.' + kind, 0.2)) return 0;
    if (sample('sting_' + kind, { vol: 0.9 })) return 1000;
    var dur = 0; withTrim('sting.' + kind, function () { dur = f(); });
    return Math.round(dur * 1000);
  }

  // ---------------------------------------------------------------- public API
  return {
    init: init, apply: apply, musicOn: musicOn, musicOff: musicOff, setMood: setMood,
    getMood: function () { return wantedMood; },
    // One die hitting the table or another die (v: 0..1 = how hard)
    diceHit: guard(function (v) { hit(v, 0); }),
    cupRattle: guard(cupRattle), clatter: guard(clatter), pickup: guard(pickup), thunk: guard(thunk),
    click: guard(click), pop: guard(pop), chime: guard(chime), boop: guard(boop),
    slam: guard(slam), fanfare: guard(fanfare), crowd: guard(crowd), whistle: guard(whistle),
    speak: speak, stopSpeak: stopSpeak,
    // character voices, crowd, themes, stingers (each returns a duration in ms, 0 if nothing played)
    babble: guard0(babble), stopBabble: guard(stopBabble), talk: guard0(talk),
    crowdReact: guard0(crowdReact), ambience: guard(ambience),
    theme: guard0(theme), danceMusic: guard0(danceMusic), stopDance: guard(stopDance), sting: guard0(stingKind),
    // diagnostics / tests
    _plan: function (text, who) { return planBabble(babbleClean(text), BAB[who] || BAB.pip); },
    _danceAll: guard(function (ms) { var r = danceMusic(ms); while (dance && dance.next < dance.n) { danceBar(dance, dance.next++); } return r; }),
    _trims: function () { return trims; },
    _amb: function () { return amb ? { kind: amb.kind, level: amb.level } : null; },
    _stats: function () { return { voices: voices, peakVoices: peakVoices, created: created, diceVoices: diceVoices, mood: wantedMood, musicRunning: !!timer }; },
    _clean: cleanForSpeech,
    _useContext: function (c) { try { stopMusic(); ctx = null; onceBuses = {}; build(c); gestured = true; return true; } catch (e) { return false; } },
    _hit: guard(hit), _bar: guard(function (t, mood) { wantedMood = mood || wantedMood; applyLevels(); scheduleBar(t || 0, barNo++); }), _sting: guard(winSting)
  };
})();
// Every public function is guarded; wrap the ones declared outside the object literal too.
(function () { ['init', 'apply', 'musicOn', 'musicOff', 'setMood'].forEach(function (k) { var f = Snd[k]; Snd[k] = function () { try { return f.apply(null, arguments); } catch (e) {} }; }); })();
