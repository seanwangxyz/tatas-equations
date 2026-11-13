// BIRTHDAY: the creature choir for the birthday easter egg (js/three/birthday.js loads this file on demand with a
// dynamic import; it also works as a plain <script>, and js/title-sfx.js loads it that way as soon as the show starts
// so the song is ready before the singing). "Happy Birthday to You" (traditional melody, public domain).
//
// HOW IT IS MADE (docs/handoff/audio2.md): ten synthesised singers (six on the tune, three big low monsters an octave
// down, one small bright creature) sing the real words. Each singer is ONE continuous voice for the whole song: a
// soft glottal-pulse wave (a PeriodicWave with a -10 dB/octave tilt) through three formant filters that move from vowel
// to vowel with the syllables ("Hap-py birth-day to you", "dear Ty-son"), gentle pitch glides between notes (legato),
// a small scoop into each line, natural vibrato that starts late in long notes (about 5.5 Hz), a slow pitch drift,
// soft breath / consonant noise (h, p, t, s), and its own timing, tuning and place in the stereo picture. Under them a
// warm waltz: a soft piano bass on beat 1, piano chords on 2 and 3, and a quiet music box doubling the tune. A small
// generated room reverb glues it. The whole song is RENDERED ONCE, offline (OfflineAudioContext, its own thread), into
// one stereo AudioBuffer; the show then plays that buffer (one node instead of hundreds of live oscillators, which
// is what made the old choir crackle on iPads). Everything plays on the game's one AudioContext (Snd.context())
// through Snd.bus('music') (or 'sfx' when the music is switched off but effects are on).
//
//   BirthdaySfx.song(plan, delay) -> { t0 (audio time of beat 0), stop() }   plan: { notes, chords, beat } from birthday.js
//   BirthdaySfx.pop(kind)           'sparkle' | 'hooray' little one-shots
//   BirthdaySfx.stopAll()
//   BirthdaySfx.prerender() -> Promise<AudioBuffer|null>   (starts by itself when this file loads; safe to call again)
//   BirthdaySfx.ready()             true once the song buffer exists
//   BirthdaySfx._into(ctx, dest, k) renders the song live into any context (the offline checker); _syllables() the lyric plan
(function () {
  if (window.BirthdaySfx && window.BirthdaySfx._v === 2) return;   // loaded twice (plain script + module import): keep the first
  var ownCtx = null, playing = [], rendered = { song: null, hooray: null }, pending = {};
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
  // a seeded random, so every render of the song is the same performance (and the checker is repeatable)
  var seed = 7;
  function rnd(a, b) { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); }

  // ---- the song plan: a copy of js/three/birthday.js songPlan (so the song can be rendered before the show asks)
  var TUNE = [[67, .75], [67, .25], [69, 1], [67, 1], [72, 1], [71, 2], [67, .75], [67, .25], [69, 1], [67, 1], [74, 1], [72, 2],
    [67, .75], [67, .25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 3], [77, .75], [77, .25], [76, 1], [72, 1], [74, 1], [72, 3]];
  var CHORDS = [[1, 'C'], [4, 'G'], [7, 'G'], [10, 'C'], [13, 'C7'], [16, 'F'], [20, 'C'], [23, 'G'], [24, 'C']];
  var CH = { C: [48, [64, 67, 72]], G: [43, [62, 65, 71]], C7: [48, [64, 70, 72]], F: [41, [65, 69, 72]] };
  function defaultPlan(beat) {
    var t = 0, notes = TUNE.map(function (n) { var o = { t: t, d: n[1] * beat, m: n[0] }; t += n[1] * beat; return o; });
    var chords = CHORDS.map(function (c, i) { var nb = i + 1 < CHORDS.length ? CHORDS[i + 1][0] - c[0] : 2, d = CH[c[1]]; return { t: c[0] * beat, beats: Math.max(1, Math.min(3, nb)), bass: d[0], notes: d[1] }; });
    return { notes: notes, chords: chords, beat: beat, total: t };
  }
  // the same performance? (the show's plan against the one rendered ahead)
  function samePlan(a, b) {
    if (!a || !b || a.notes.length !== b.notes.length || Math.abs(a.beat - b.beat) > 1e-6 || a.chords.length !== b.chords.length) return false;
    for (var i = 0; i < a.notes.length; i++) if (a.notes[i].m !== b.notes[i].m || Math.abs(a.notes[i].t - b.notes[i].t) > 1e-6) return false;
    for (i = 0; i < a.chords.length; i++) if (a.chords[i].bass !== b.chords[i].bass || Math.abs(a.chords[i].t - b.chords[i].t) > 1e-6) return false;
    return true;
  }

  // ---- the words: one syllable per note. [consonant before the vowel, vowel, vowel it glides to (or ''), word]
  //   consonants: h (breath), p t (stop + a puff), b d (voiced stop: a short dip), y (glide from "ee"), s (a soft hiss)
  var L1 = [['h', 'ae', '', 'Hap'], ['p', 'i', '', 'py'], ['b', 'er', '', 'birth'], ['d', 'e', 'i', 'day'], ['t', 'u', '', 'to'], ['y', 'u', '', 'you']];
  var L3 = [['h', 'ae', '', 'Hap'], ['p', 'i', '', 'py'], ['b', 'er', '', 'birth'], ['d', 'e', 'i', 'day'], ['d', 'i', 'er', 'dear'], ['t', 'ah', 'i', 'Ty'], ['s', 'uh', 'n', 'son']];
  var LYRICS = L1.concat(L1, L3, L1), LINE_START = [0, 6, 12, 19], LINE_END = [5, 11, 18, 24];
  // formants (Hz) and bandwidth-ish Q per vowel, for a bright, friendly (not operatic) voice; scaled per singer
  var VOW = {
    ae: [760, 1850, 2700], i: [320, 2350, 3000], er: [500, 1400, 1750], e: [520, 1850, 2550], u: [360, 880, 2300],
    ah: [780, 1220, 2600], uh: [640, 1200, 2550], o: [500, 900, 2450], n: [280, 1500, 2500]
  };
  // the old plan vowels (birthday.js TUNE) for any other tune
  var OLDV = { a: 'ah', ee: 'i', er: 'er', eh: 'e', oo: 'u', oh: 'o', i: 'i' };
  function syllables(plan) {
    var std = plan.notes.length === 25;
    return plan.notes.map(function (n, i) {
      var L = std ? LYRICS[i] : ['d', OLDV[n.v] || 'ah', '', n.v || 'la'];
      return { t: n.t, d: n.d, m: n.m, cons: L[0], v: L[1], v2: L[2], word: L[3],
        start: std ? LINE_START.indexOf(i) >= 0 : i === 0, end: std ? LINE_END.indexOf(i) >= 0 : i === plan.notes.length - 1,
        line: std ? (i < 6 ? 0 : i < 12 ? 1 : i < 19 ? 2 : 3) : 0, last: i === plan.notes.length - 1 };
    });
  }

  // ---- shared material for one context: the glottal wave, a noise buffer, the room
  function kit(c) {
    if (c._bdayKit) return c._bdayKit;
    var N = 48, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    // a soft glottal-pulse spectrum: about -7 dB per octave (a soft glottal pulse with the lips' lift), the top harmonics eased out (no buzz)
    for (var n = 1; n <= N; n++) im[n] = Math.pow(n, -1.15) * (n > 24 ? Math.cos((n - 24) / (N - 24) * Math.PI / 2) : 1) * (n % 2 ? 1 : 0.85);
    var wave = c.createPeriodicWave(re, im);
    var sr = c.sampleRate, nb = c.createBuffer(1, Math.floor(sr * 2), sr), nd = nb.getChannelData(0), s = 99;
    for (var i = 0; i < nd.length; i++) { s = (s * 16807) % 2147483647; nd[i] = s / 1073741823.5 - 1; }
    // a small room: 1.3 s, stereo, darkening as it decays, 14 ms before the first reflections
    var len = Math.floor(sr * 1.3), ir = c.createBuffer(2, len, sr), pre = Math.floor(sr * 0.014);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch), lp = 0, r = 1234 + ch * 777;
      for (var k = pre; k < len; k++) {
        var u = k / len; r = (r * 16807) % 2147483647; var w = r / 1073741823.5 - 1;
        lp += (w - lp) * (0.55 - 0.45 * u); d[k] = lp * Math.pow(1 - u, 3) * Math.exp(-u * 2);
      }
      for (k = 0; k < Math.min(pre + 64, len); k++) d[k] *= Math.max(0, (k - pre) / 64);   // no step at the start
    }
    var conv = c.createConvolver(); conv.normalize = true; conv.buffer = ir;
    c._bdayKit = { wave: wave, noise: nb, conv: conv };
    return c._bdayKit;
  }

  // ---- one singer: a single continuous voice through the whole song. o: { oct, fs (formant scale), det (cents),
  //   lag (s), vol, pan, vib (cents), rate (Hz), bright (0..1), breath }
  // A section (a few singers who share one set of formant filters, one breath noise and one place in the stereo
  // picture). Sharing keeps the offline render fast: 4 formant chains instead of 10 (the filters are the cost).
  function section(c, dest, wet, o) {
    var K = kit(c), inp = c.createGain(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), f3 = c.createBiquadFilter();
    var pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    f1.type = f2.type = f3.type = 'peaking'; f1.Q.value = 3.2; f2.Q.value = 5.5; f3.Q.value = 7;
    f1.gain.value = 13; f2.gain.value = 11 + 3 * o.bright; f3.gain.value = 5 + 4 * o.bright;
    inp.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(pan);
    if (pan.pan) pan.pan.value = o.pan;
    pan.connect(dest); var ws = c.createGain(); ws.gain.value = o.wet; pan.connect(ws); ws.connect(wet);
    // breath and consonants: soft filtered noise, only in short bursts
    var nz = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
    nz.buffer = K.noise; nz.loop = true; nf.type = 'bandpass'; nf.Q.value = 1.2; nf.frequency.value = 2000; ng.gain.value = 0;
    nz.connect(nf); nf.connect(ng); ng.connect(pan);
    return { inp: inp, f: [f1, f2, f3], nz: nz, nf: nf, ng: ng, fs: o.fs, breath: o.breath, lead: null };
  }
  function singer(c, sec, syl, t0, o) {
    var K = kit(c), src = c.createOscillator(), lfo = c.createOscillator(), vg = c.createGain(), amp = c.createGain();
    var lead = !sec.lead; if (lead) sec.lead = o;      // the first singer of a section moves its vowels and breath
    src.setPeriodicWave(K.wave); src.detune.value = o.det;
    lfo.frequency.value = o.rate; lfo.connect(vg); vg.connect(src.detune); vg.gain.value = 0;
    src.connect(amp); amp.connect(sec.inp);
    var f1 = sec.f[0], f2 = sec.f[1], f3 = sec.f[2], nf = sec.nf, ng = sec.ng, nz = sec.nz;
    var A = o.vol, g = amp.gain, F = src.frequency, fs = sec.fs, nb = sec.breath;
    g.value = 0;
    // formant moves are short linear ramps (not setTargetAtTime): between moves the filters are constant, so the
    // browser does not recompute their coefficients every sample (that made the render 3x slower)
    var FL = [f1, f2, f3], fprev = null, fEnd = 0;
    function formants(v, at, tc) {
      if (!lead) return;
      var V = VOW[v] || VOW.ah, a = Math.max(at, fEnd + 0.001), e = a + Math.max(0.02, tc * 2.5);
      FL.forEach(function (fl, i) { fl.frequency.setValueAtTime(fprev[i], a); fl.frequency.linearRampToValueAtTime(V[i] * fs, e); });
      fprev = [V[0] * fs, V[1] * fs, V[2] * fs]; fEnd = e;
    }
    function puff(at, len, f, q, lvl) { if (!lead) return; nf.frequency.setValueAtTime(f, Math.max(0, at - 0.004)); nf.Q.setValueAtTime(q, Math.max(0, at - 0.004)); ng.gain.setTargetAtTime(lvl * nb, at, len * 0.2); ng.gain.setTargetAtTime(0, at + len * 0.7, len * 0.25); }
    var V0 = VOW[syl[0].v] || VOW.ah; fprev = [V0[0] * fs, V0[1] * fs, V0[2] * fs];
    if (lead) { f1.frequency.value = fprev[0]; f2.frequency.value = fprev[1]; f3.frequency.value = fprev[2]; }
    var tEnd = 0;
    syl.forEach(function (y) {
      var t = t0 + y.t + o.lag + rnd(-0.008, 0.008), f = mtof(y.m + 12 * o.oct), d = y.d;
      var acc = (y.d < 0.2 ? 0.82 : 1) * (y.line === 2 ? 1.12 : 1) * (y.line === 3 ? 1.05 : 1);
      // the consonant comes just before the beat, so the vowel lands on it
      if (y.start) {
        F.setValueAtTime(f * Math.pow(2, -70 / 1200), t - 0.1);           // silent here: a free jump, then a scoop up
        F.setTargetAtTime(f, t - 0.02, 0.05);
        formants(y.v, t - 0.1, 0.01);
        g.setTargetAtTime(A * 0.12, t - 0.1, 0.03); puff(t - 0.1, 0.1, (VOW[y.v] || VOW.ah)[1] * fs, 0.8, 0.5);
      } else {
        F.setTargetAtTime(f, t - 0.025, 0.026);                          // legato: glide from the last note
        if (y.cons === 'p' || y.cons === 't') { g.setTargetAtTime(A * 0.04, t - 0.06, 0.012); puff(t - 0.015, 0.045, y.cons === 't' ? 3000 : 1600, 1.5, 0.7); }
        else if (y.cons === 'b' || y.cons === 'd') g.setTargetAtTime(A * 0.3, t - 0.05, 0.012);
        else if (y.cons === 's') { g.setTargetAtTime(A * 0.05, t - 0.1, 0.014); puff(t - 0.095, 0.09, 3600, 2.5, 0.45); }
        else if (y.cons === 'r') formants('er', t - 0.07, 0.015);
        else if (y.cons === 'y') { g.setTargetAtTime(A * 0.75, t - 0.04, 0.015); formants('i', t - 0.04, 0.012); }
        formants(y.v, y.cons === 'y' ? t + 0.01 : t - 0.03, y.cons === 'y' ? 0.04 : 0.025);
      }
      g.setTargetAtTime(A * acc, t, 0.022);
      if (y.v2) formants(y.v2, t + d * (y.v2 === 'n' ? 0.72 : 0.55), 0.06);
      if (y.v2 === 'n') g.setTargetAtTime(A * acc * 0.55, t + d * 0.72, 0.06);
      // vibrato: almost none while the note settles, then a gentle wobble on the longer notes
      vg.gain.setTargetAtTime(3, t, 0.04);
      if (d > 0.45) vg.gain.setTargetAtTime(o.vib, t + 0.24, 0.16);
      if (d > 1.2) g.setTargetAtTime(A * acc * 1.07, t + d * 0.35, 0.3);   // a little swell on the held notes
      if (y.end) {
        var rel = y.last ? t + d - 0.25 : t + d - 0.2;
        g.setTargetAtTime(0, rel, y.last ? 0.14 : 0.045);
        vg.gain.setTargetAtTime(o.vib * 0.6, rel, 0.1);
        tEnd = t + d + (y.last ? 1.2 : 0.3);
      }
    });
    [src, lfo].concat(lead ? [nz] : []).forEach(function (n) { n.start(Math.max(0, t0 - 0.2)); n.stop(tEnd + 0.1); });
    return tEnd;
  }

  // ---- the waltz: a soft piano and a music box, synthesised in js (additive: each partial with its own decay, the
  // upper ones dying first like a real string; a felt-hammer attack; the damper at the key's release). Each distinct
  // key is made once and mixed in by copying: far cheaper than ~100 short-lived oscillator + filter graphs.
  var KINDS = {
    piano: { P: [1, 0.55, 0.28, 0.16, 0.08, 0.05, 0.025], att: 0.006, tc: 0.95, B: 0.0004 },
    bass: { P: [1, 0.45, 0.16, 0.08, 0.03], att: 0.012, tc: 1.2, B: 0.0002 },
    box: { P: [1, 0, 0.16, 0, 0.05], att: 0.003, tc: 0.6, B: 0, ping: 4 }
  };
  var keyCache = {};
  function keyData(sr, m, kind, dur) {
    var id = sr + ':' + m + ':' + kind + ':' + dur.toFixed(3); if (keyCache[id]) return keyCache[id];
    var K = KINDS[kind], f = mtof(m), n = Math.floor(sr * (dur + 0.45)), d = new Float32Array(n), base = K.tc * Math.max(0.4, 1 - (m - 48) * 0.012), i;
    K.P.forEach(function (a, j) {
      if (!a) return; var h = j + 1, fh = f * h * Math.sqrt(1 + K.B * h * h); if (fh > 4200) return;
      var w = 2 * Math.PI * fh / sr, tc = base / (1 + 0.7 * j), rd = Math.exp(-1 / (sr * tc)), e = a;
      for (i = 0; i < n; i++) { d[i] += Math.sin(w * i) * e; e *= rd; }
    });
    if (K.ping) { var wp = 2 * Math.PI * f * K.ping / sr, ep = 0.12, rp = Math.exp(-1 / (sr * 0.1)); for (i = 0; i < n; i++) { d[i] += Math.sin(wp * i) * ep; ep *= rp; } }
    var at = Math.floor(sr * K.att), rel = Math.floor(sr * dur), rr = Math.exp(-1 / (sr * 0.07)), r = 1, k1 = Math.exp(-1 / (sr * 0.1));
    for (i = 0; i < n; i++) {
      var env = (i < at ? i / at : 1) * (0.5 + 0.5 * Math.pow(k1, i));   // a quick drop after the strike, then the ring
      if (i >= rel) r *= rr; d[i] *= env * r;
    }
    for (i = 0; i < 64 && i < n; i++) d[n - 1 - i] *= i / 64;
    keyCache[id] = d; return d;
  }
  function waltzEvents(plan, t0) {
    var b = plan.beat, ev = [];
    plan.chords.forEach(function (ch) {
      var t = t0 + ch.t;
      ev.push({ t: t, m: ch.bass, k: 'bass', v: 0.6, d: b * 1.6, p: 0 }, { t: t, m: ch.bass + 12, k: 'bass', v: 0.14, d: b * 0.9, p: 0 });   // the "oom" with a soft octave
      for (var k = 1; k < ch.beats; k++) ch.notes.forEach(function (m, j) { ev.push({ t: t + k * b + j * 0.007, m: m - 12, k: 'piano', v: k === 1 ? 0.16 : 0.14, d: b * 0.72, p: (j - 1) * 0.25 }); });   // "pah pah", under the voices
    });
    // the music box doubles the tune an octave up, quietly (it keeps little ears on the melody)
    plan.notes.forEach(function (n) { ev.push({ t: t0 + n.t, m: n.m + 12, k: 'box', v: 0.08, d: Math.min(n.d, b * 1.2), p: 0.3 }); });
    return ev;
  }
  // into a rendered 4-channel buffer: dry on 1-2, a little on the reverb send 3-4
  function waltzMix(b, plan, t0, send) {
    var sr = b.sampleRate, ch = [0, 1, 2, 3].map(function (i) { return b.getChannelData(i); });
    waltzEvents(plan, t0).forEach(function (e) {
      var d = keyData(sr, e.m, e.k, e.d), s0 = Math.round(e.t * sr), gl = e.v * Math.sqrt((1 - e.p) / 2) * 1.41, gr = e.v * Math.sqrt((1 + e.p) / 2) * 1.41;
      for (var i = 0, j = s0; i < d.length && j < b.length; i++, j++) { if (j < 0) continue; var x = d[i]; ch[0][j] += x * gl; ch[1][j] += x * gr; ch[2][j] += x * gl * send; ch[3][j] += x * gr * send; }
    });
  }
  // balance check (docs/handoff/audio2.md): RMS of the choir, the waltz and the room, each alone
  function rmsOf(arrs) { var z = 0, n = 0; arrs.forEach(function (a) { for (var i = 0; i < a.length; i++) { z += a[i] * a[i]; } n += a.length; }); return Math.sqrt(z / Math.max(1, n)); }
  function balance(b4, plan) {
    var choirR = rmsOf([b4.getChannelData(0), b4.getChannelData(1)]), z = { sampleRate: b4.sampleRate, length: b4.length, ch: [0, 1, 2, 3].map(function () { return new Float32Array(b4.length); }) };
    z.getChannelData = function (i) { return z.ch[i]; };
    waltzMix(z, plan, PAD, 0); return { choir: choirR, waltz: rmsOf([z.ch[0], z.ch[1]]) };
  }
  // live (fallback): each key as a little buffer
  function waltzLive(c, dest, plan, t0) {
    waltzEvents(plan, t0).forEach(function (e) {
      var d = keyData(c.sampleRate, e.m, e.k, e.d), bf = c.createBuffer(1, d.length, c.sampleRate); bf.getChannelData(0).set(d);
      var s = c.createBufferSource(), g = c.createGain(); s.buffer = bf; g.gain.value = e.v; s.connect(g); g.connect(dest); s.start(Math.max(c.currentTime, e.t));
    });
  }

  // ---- the whole song into one context (offline for the buffer, or live as a fallback). Returns the end time.
  // four sections: two on the tune (left and right), the big low monsters an octave down, one small bright creature
  var SECTIONS = [
    { fs: 1.0, bright: 0.4, pan: -0.4, breath: 0.12, wet: 1 }, { fs: 1.07, bright: 0.55, pan: 0.42, breath: 0.1, wet: 1 },
    { fs: 0.83, bright: 0.1, pan: -0.08, breath: 0.08, wet: 0.8 }, { fs: 1.22, bright: 1.0, pan: 0.75, breath: 0.04, wet: 1.2 }];
  var SINGERS = [   // s: section; lag = how late this singer is (a group, not a robot); det in cents; vib in cents
    { s: 0, oct: 0, det: -6, lag: 0.0, vol: 0.2, vib: 22, rate: 5.4 }, { s: 0, oct: 0, det: -11, lag: -0.012, vol: 0.18, vib: 26, rate: 5.2 },
    { s: 0, oct: 0, det: 3, lag: 0.03, vol: 0.14, vib: 24, rate: 5.3 },
    { s: 1, oct: 0, det: 7, lag: 0.018, vol: 0.18, vib: 18, rate: 5.8 }, { s: 1, oct: 0, det: 12, lag: 0.026, vol: 0.15, vib: 20, rate: 6.0 },
    { s: 1, oct: 0, det: -2, lag: 0.008, vol: 0.16, vib: 16, rate: 5.6 },
    { s: 2, oct: -1, det: -5, lag: 0.02, vol: 0.15, vib: 18, rate: 4.9 }, { s: 2, oct: -1, det: 8, lag: 0.04, vol: 0.13, vib: 20, rate: 5.1 },
    { s: 2, oct: -1, det: 0, lag: -0.006, vol: 0.11, vib: 14, rate: 5.0 },
    { s: 3, oct: 0, det: 15, lag: 0.012, vol: 0.09, vib: 30, rate: 6.4 }];
  // the choir into (dry, wet) nodes. Gentle tone shaping on the whole choir: no rumble, nothing harsh above ~3.6 kHz
  function choir(c, dry, wet, syl, t0) {
    var lp = c.createBiquadFilter(), hp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 0.6; hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.6;
    lp.connect(hp); hp.connect(dry);
    var secs = SECTIONS.map(function (o) { return section(c, lp, wet, o); }), end = 0;
    SINGERS.forEach(function (o) { end = Math.max(end, singer(c, secs[o.s], syl, t0, o)); });
    return end;
  }
  // wetOut: where the reverb send goes (a ConvolverNode live; offline, channels 3-4 for the reverb pass in js)
  // (offline, the waltz is mixed in afterwards by waltzMix; live, it plays as little buffers)
  function perform(c, dry, wetOut, plan, t0, live) {
    seed = 7;
    var wet = c.createGain(); wet.gain.value = 0.34; wet.connect(wetOut);
    var end = choir(c, dry, wet, syllables(plan), t0);
    if (live) { var acc = c.createGain(), accW = c.createGain(); acc.connect(dry); accW.gain.value = 0.14; acc.connect(accW); accW.connect(wetOut); waltzLive(c, acc, plan, t0); }
    return Math.max(end, t0 + plan.total + 1.6);
  }
  // "Hoo-ray!": the same choir, two notes
  var HOORAY = [{ t: 0, d: 0.2, m: 67, cons: 'h', v: 'u', v2: '', start: true, end: false, line: 3 }, { t: 0.2, d: 0.62, m: 72, cons: 'r', v: 'e', v2: 'i', start: false, end: true, last: true, line: 2 }];
  function hooray(c, dry, wetOut, t0) { seed = 21; var wet = c.createGain(); wet.gain.value = 0.22; wet.connect(wetOut); return choir(c, dry, wet, HOORAY, t0); }
  // live (no offline rendering): the convolver room
  function liveRoom(c, dest) { var K = kit(c), rv = c.createGain(); K.conv.connect(rv); rv.connect(dest); return K.conv; }

  // ---- a small room in js (a Freeverb-style network: 8 damped combs + 4 all-passes a side), run on the rendered send
  // channels in slices so the page never stalls; much cheaper than a ConvolverNode in the offline render
  function roomPass(b, done) {
    var sr = b.sampleRate, n = b.length, s = sr / 44100, out = [b.getChannelData(0), b.getChannelData(1)], wl = b.getChannelData(2), wr = b.getChannelData(3);
    var CD = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AD = [556, 441, 341, 225], fb = 0.8, damp = 0.32, pre = Math.round(0.012 * sr);
    var side = [0, 23].map(function (sp) {
      return { c: CD.map(function (d) { return { b: new Float32Array(Math.round((d + sp) * s)), i: 0, f: 0 }; }), a: AD.map(function (d) { return { b: new Float32Array(Math.round((d + sp) * s)), i: 0 }; }) };
    });
    var pd = new Float32Array(pre + 1), pi = 0, i = 0, STEP = Math.round(sr * 0.75);
    (function slice() {
      var e = Math.min(n, i + STEP);
      for (; i < e; i++) {
        var x = (wl[i] + wr[i]) * 0.5, inp = pd[pi]; pd[pi] = x; pi = (pi + 1) % pd.length;
        for (var ch = 0; ch < 2; ch++) {
          var S = side[ch], y = 0, k, cb;
          for (k = 0; k < 8; k++) { cb = S.c[k]; var o = cb.b[cb.i]; cb.f = o * (1 - damp) + cb.f * damp; cb.b[cb.i] = inp * 0.015 + cb.f * fb; if (++cb.i >= cb.b.length) cb.i = 0; y += o; }
          for (k = 0; k < 4; k++) { cb = S.a[k]; var bo = cb.b[cb.i]; cb.b[cb.i] = y + bo * 0.5; y = bo - y; if (++cb.i >= cb.b.length) cb.i = 0; }
          out[ch][i] += y;
        }
      }
      if (i < n) setTimeout(slice, 0); else done(b);
    })();
  }

  // ---- offline rendering (never blocks the page: the graph is small and the render runs on the audio render thread)
  var PAD = 0.3;                      // the buffer starts this long before beat 0 (room for the first breath)
  var TARGET_RMS = 0.08;              // loudness of the rendered song (before the music bus): the level of the old choir
  function now() { return window.performance ? performance.now() : Date.now(); }
  function renderOff(sec, build, post) {
    var O = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!O) return Promise.resolve(null);
    var sr = 48000; try { var lc = ctx(); if (lc && lc.sampleRate) sr = lc.sampleRate; } catch (e) {}
    // four channels: 1-2 the dry mix, 3-4 the reverb send (the room is added in js afterwards)
    var off; try { off = new O(4, Math.ceil(sr * sec), sr); } catch (e) { return Promise.resolve(null); }
    try {
      var mg = off.createChannelMerger(4), dry = off.createGain(), wet = off.createGain(), sd = off.createChannelSplitter(2), sw = off.createChannelSplitter(2);
      [dry, wet].forEach(function (g) { g.channelCount = 2; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; });
      dry.connect(sd); wet.connect(sw); sd.connect(mg, 0, 0); sd.connect(mg, 1, 1); sw.connect(mg, 0, 2); sw.connect(mg, 1, 3);
      off.destination.channelInterpretation = 'discrete'; mg.connect(off.destination);
      build(off, dry, wet);
    } catch (e) { return Promise.resolve(null); }
    var t0 = now();
    return new Promise(function (res) {
      var done = false;
      function fin(b) {
        if (done) return; done = true;
        if (!b || b.numberOfChannels < 4) { res(null); return; }
        var t1 = now(); if (post) try { post(b); } catch (e) {}
        roomPass(b, function () {
          var o2; try { o2 = c2(b); } catch (e) { res(null); return; }
          o2 = normalise(o2); o2._ms = { render: Math.round(t1 - t0), room: Math.round(now() - t1) }; res(o2);
        });
      }
      off.oncomplete = function (e) { fin(e.renderedBuffer); };
      try { var p = off.startRendering(); if (p && p.then) p.then(fin, function () { fin(null); }); } catch (e) { fin(null); }
    });
  }
  function c2(b) {   // the dry+room channels as a plain stereo buffer
    var c = ctx(), o = c ? c.createBuffer(2, b.length, b.sampleRate) : new AudioBuffer({ numberOfChannels: 2, length: b.length, sampleRate: b.sampleRate });
    o.getChannelData(0).set(b.getChannelData(0)); o.getChannelData(1).set(b.getChannelData(1));
    return o;
  }
  function normalise(b) {
    var n = b.length, z = 0, cnt = 0, pk = 0, c, i;
    for (c = 0; c < b.numberOfChannels; c++) { var d = b.getChannelData(c); for (i = 0; i < n; i++) { var a = Math.abs(d[i]); if (a > pk) pk = a; if (a > 0.003) { z += d[i] * d[i]; cnt++; } } }
    var rms = Math.sqrt(z / Math.max(1, cnt)), k = rms > 0 ? Math.min(TARGET_RMS / rms, 0.85 / Math.max(pk, 1e-6)) : 1;
    for (c = 0; c < b.numberOfChannels; c++) { var e = b.getChannelData(c); for (i = 0; i < n; i++) e[i] *= k; }
    var fo = Math.min(n, Math.floor(b.sampleRate * 0.05));   // the very end fades (it is the room's tail anyway)
    for (c = 0; c < b.numberOfChannels; c++) { var f = b.getChannelData(c); for (i = 0; i < fo; i++) f[n - 1 - i] *= i / fo; }
    b._stats = { rms: rms, peak: pk, k: k };
    return b;
  }
  var lastRender = {};
  function prerender() {
    if (rendered.song) return Promise.resolve(rendered.song);
    if (pending.song) return pending.song;
    var plan = defaultPlan(0.56), t = (window.performance ? performance.now() : 0);
    pending.song = renderOff(PAD + plan.total + 2.2, function (c, d, w) { perform(c, d, w, plan, PAD); }, function (b4) { lastRender.balance = balance(b4, plan); waltzMix(b4, plan, PAD, 0.14); }).then(function (b) {
      if (b) { b._plan = plan; rendered.song = b; lastRender.song = Math.round((window.performance ? performance.now() : 0) - t); }
      pending.song = null; return b;
    });
    pending.song.then(function () { if (!rendered.hooray && !pending.hooray) pending.hooray = renderOff(1.9, function (c, d, w) { hooray(c, d, w, 0.15); }).then(function (b) { rendered.hooray = b; pending.hooray = null; return b; }); });
    return pending.song;
  }

  // ---- playback: one buffer source -> one gain (fades in/out) -> the bus
  function playBuf(c, o, buf, when, offset, fadeIn) {
    var s = c.createBufferSource(), g = c.createGain(), now = c.currentTime;
    s.buffer = buf; s.connect(g); g.connect(o.node);
    if (fadeIn) { g.gain.setValueAtTime(0, Math.max(now, when)); g.gain.linearRampToValueAtTime(o.k, Math.max(now, when) + fadeIn); } else g.gain.value = o.k;
    s.start(Math.max(now, when), Math.max(0, offset || 0));
    var h = { src: s, g: g, c: c };
    playing.push(h); s.onended = function () { var i = playing.indexOf(h); if (i >= 0) playing.splice(i, 1); try { g.disconnect(); } catch (e) {} };
    return h;
  }
  function fadeStop(h, tc) {
    try { var n = h.c.currentTime; h.g.gain.cancelScheduledValues(n); h.g.gain.setValueAtTime(h.g.gain.value, n); h.g.gain.setTargetAtTime(0, n, tc || 0.05); h.src.stop(n + (tc || 0.05) * 8); } catch (e) {}
  }
  function song(plan, delay, into) {   // into: { ctx, dest, k } renders live into any context (the offline level check)
    var c = into ? into.ctx : ctx(); if (!c) return null;
    try { if (!into && c.state === 'suspended') c.resume(); } catch (e) {}
    plan = plan || defaultPlan(0.56);
    var o = into ? { node: into.dest, k: into.k || 1 } : out(c), t0 = c.currentTime + (delay == null ? 0.12 : delay), mine = [];
    var h = { t0: t0, stop: function () { mine.forEach(function (x) { fadeStop(x, 0.05); }); mine.length = 0; h.stopped = true; } };
    if (!o || !o.node) return h;
    if (into) { var bus = c.createGain(); bus.gain.value = o.k * 0.55; bus.connect(o.node); perform(c, bus, liveRoom(c, bus), plan, t0, true); return h; }
    var same = samePlan(plan, defaultPlan(plan.beat));
    function go(buf) {
      if (h.stopped || !buf) return false;
      var late = c.currentTime - (t0 - PAD);                          // > 0: the render finished after the song should have begun
      if (late > buf.duration - 2.5) return true;                      // too late to be worth it
      // the first breath is at PAD - 0.1: skipping silence before it is free; joining later fades in over 0.12 s
      var joined = late > PAD - 0.12;
      mine.push(playBuf(c, o, buf, t0 - PAD, late > 0 ? late : 0, joined ? 0.12 : 0));
      h.mode = joined ? 'buffer, joined ' + (late - PAD).toFixed(2) + ' s after beat 0' : 'buffer';
      return true;
    }
    if (same && rendered.song) { go(rendered.song); return h; }
    if (same && (pending.song || prerender())) {
      // not ready yet (a slow device): the song joins as soon as it is, on the beat it should be at (the mouths follow t0)
      h.mode = 'waiting';
      (pending.song || Promise.resolve(rendered.song)).then(function (b) { if (!go(b) && !h.stopped && !b) live(); });
      return h;
    }
    live(); return h;
    // no offline rendering here (very old browser) or a different tune: sing it live (about 160 nodes, not 1200)
    function live() { var bus = c.createGain(); bus.gain.value = o.k * 0.55; bus.connect(o.node); perform(c, bus, liveRoom(c, bus), plan, t0, true); h.mode = 'live'; mine.push({ src: { stop: function () {} }, g: bus, c: c }); }
  }
  function pop(kind) {
    var c = ctx(); if (!c) return; var o = out(c); if (!o || !o.node) return;
    var t = c.currentTime + 0.02;
    if (kind === 'sparkle') { var b = c.createGain(); b.gain.value = o.k * 2.2; b.connect(o.node); [84, 88, 91, 96].forEach(function (m, i) { var d = keyData(c.sampleRate, m, 'box', 0.45), bf = c.createBuffer(1, d.length, c.sampleRate), s = c.createBufferSource(), g = c.createGain(); bf.getChannelData(0).set(d); s.buffer = bf; g.gain.value = 0.05; s.connect(g); g.connect(b); s.start(t + i * 0.07); });
      var ph = { src: { stop: function () {} }, g: b, c: c }; playing.push(ph);
      setTimeout(function () { var i = playing.indexOf(ph); if (i >= 0) playing.splice(i, 1); try { b.disconnect(); } catch (e) {} }, 1600); }
    else if (kind === 'hooray') {
      if (rendered.hooray) playBuf(c, o, rendered.hooray, t - 0.13, 0, 0);
      else { var hb = c.createGain(); hb.gain.value = o.k * 0.55; hb.connect(o.node); hooray(c, hb, liveRoom(c, hb), t); }
    }
  }
  function stopAll() { playing.slice().forEach(function (h) { fadeStop(h, 0.04); }); playing = []; }
  window.BirthdaySfx = {
    _v: 2, song: song, pop: pop, stopAll: stopAll, prerender: prerender,
    ready: function () { return !!rendered.song; }, live: function () { return playing.length; },
    // the checker: the rendered buffer (as the show plays it), or the live performance when there is none yet
    _into: function (c, dest, k, forceLive) {
      var b = rendered.song;
      if (b && !forceLive) { var s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = k; s.connect(g); g.connect(dest); s.start(c.currentTime); return { t0: c.currentTime + PAD }; }
      return song(defaultPlan(0.56), 0, { ctx: c, dest: dest, k: k });
    },
    _syllables: function (plan) { return syllables(plan || defaultPlan(0.56)); }, _plan: defaultPlan,
    _buffers: function () { return { song: rendered.song, hooray: rendered.hooray, ms: lastRender.song, pad: PAD, balance: lastRender.balance }; }
  };
  // start rendering right away, but after the current task (the show is busy building its stage)
  setTimeout(function () { try { prerender(); } catch (e) {} }, 0);
})();
