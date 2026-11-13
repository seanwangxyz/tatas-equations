'use strict';
// ======================= AUDIO CHECK (offline crackle / click / clipping / node-count checker) =======================
// A developer tool (docs/handoff/audio2.md). Not loaded by the game: load it by hand in the console
// (var s = document.createElement('script'); s.src = 'js/audio-check.js'; document.head.appendChild(s)), then
//   AudioCheck.run(ids?) -> Promise<rows>      every Sound check item (or the given ids), the pile-up scenes and the song
//   AudioCheck.table(rows) -> markdown          the table in docs/handoff/audio2.md
//   AudioCheck.analyze(buffer) -> row          the numbers for one rendered buffer
// Each sound is rendered through the real mix (Snd._measure: glue, limiter, clipper) at the default volumes. Numbers:
//   jump    largest sample-to-sample step (a discontinuity shows as a step far above what the sound's own spectrum allows)
//   spikes  samples whose second difference is > 10x the local (5 ms) RMS of the second difference and > 0.02: clicks
//   clip    samples with |x| > 0.99;  tp = true peak (4x oversampled), dBTP;  dc = mean
//   on/off  level reached in the first ms after the sound starts / left in the last ms before it ends (dBFS)
//   srcs    peak number of audio sources playing at once; nodes = every node created for the render
var AudioCheck = (function () {
  function db(x) { return x > 0 ? 20 * Math.log10(x) : -120; }
  // ---- node counting: wrap the factory methods while a render is being built (offline contexts only)
  var rec = null, BAC = window.BaseAudioContext || window.AudioContext, patched = false;
  function patch() {
    if (patched || !BAC) return; patched = true;
    var P = BAC.prototype, OAC = window.OfflineAudioContext;
    Object.getOwnPropertyNames(P).forEach(function (k) {
      if (!/^create/.test(k) || typeof P[k] !== 'function' || k === 'createBuffer' || k === 'createPeriodicWave') return;
      var f = P[k];
      P[k] = function () {
        var n = f.apply(this, arguments);
        if (rec && OAC && this instanceof OAC) { rec.nodes++; if (n && n.start && n.stop) wrapSrc(n); }
        return n;
      };
    });
  }
  function wrapSrc(n) {
    var st = n.start, sp = n.stop, iv = { a: null, b: Infinity };
    rec.srcs.push(iv);
    n.start = function (w) { iv.a = Math.max(w || 0, n.context.currentTime); return st.apply(n, arguments); };
    n.stop = function (w) { iv.b = Math.max(w || 0, n.context.currentTime); return sp.apply(n, arguments); };
    // a buffer source without stop ends with its buffer
    n.addEventListener && n.addEventListener('ended', function () { if (iv.b === Infinity) iv.b = n.context.currentTime; });
  }
  function peakSources(srcs, len) {
    var ev = [];
    srcs.forEach(function (s) { if (s.a == null) return; var b = s.b; if (b === Infinity && s.buf) b = s.a + s.buf; ev.push([s.a, 1]); ev.push([Math.min(b, len), -1]); });
    ev.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
    var c = 0, m = 0; ev.forEach(function (e) { c += e[1]; if (c > m) m = c; }); return m;
  }
  // ---- 4x oversampled true peak (windowed-sinc interpolation, 24 taps a phase)
  var TP = null;
  function tpTaps() {
    if (TP) return TP; TP = [];
    for (var p = 1; p < 4; p++) { var h = [], fr = p / 4; for (var k = -12; k < 12; k++) { var x = k - fr + 1, s = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x), w = 0.5 + 0.5 * Math.cos(Math.PI * (x) / 12.5); h.push(s * w); } TP.push(h); }
    return TP;
  }
  function analyze(buf) {
    var ch = [], sr = buf.sampleRate, c, i;
    for (c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
    var n = ch[0].length, peak = 0, clip = 0, dc = 0, jump = 0, tp = 0, spikes = 0, first = n, last = -1, taps = tpTaps();
    var W = Math.round(sr * 0.005), where = [], jumpAt = 0;
    ch.forEach(function (d) {
      for (i = 0; i < n; i++) {
        var a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 0.99) clip++; dc += d[i];
        if (a > 0.001) { if (i < first) first = i; if (i > last) last = i; }
        if (i) { var j = Math.abs(d[i] - d[i - 1]); if (j > jump) { jump = j; jumpAt = i; } }
      }
      // true peak, only where the sample peak is within 3 dB of the max (cheap)
      for (i = 12; i < n - 12; i++) {
        if (Math.abs(d[i]) < peak * 0.7) continue;
        for (var p = 0; p < 3; p++) { var h = taps[p], s = 0; for (var k = 0; k < 24; k++) s += h[k] * d[i - 12 + k + 0]; if (Math.abs(s) > tp) tp = Math.abs(s); }
      }
      // clicks: second difference far above its local RMS
      var e = new Float32Array(n); for (i = 2; i < n; i++) e[i] = d[i] - 2 * d[i - 1] + d[i - 2];
      for (var s0 = 0; s0 < n; s0 += W) {
        var z = 0, m = 0, mi = 0, e1 = Math.min(n, s0 + W);
        // local level from the window and its neighbours (a click is short: it barely moves a 15 ms RMS)
        for (i = Math.max(0, s0 - W); i < Math.min(n, e1 + W); i++) z += e[i] * e[i];
        var rms = Math.sqrt(z / (Math.min(n, e1 + W) - Math.max(0, s0 - W)));
        for (i = s0; i < e1; i++) { var v = Math.abs(e[i]); if (v > m) { m = v; mi = i; } }
        if (m > 0.005 && m > 10 * rms) { spikes++; if (where.length < 8) where.push(+(mi / sr).toFixed(3)); }
      }
    });
    tp = Math.max(tp, peak);
    var ms = Math.round(sr * 0.001), on = 0, off = 0;
    if (last >= 0) ch.forEach(function (d) {
      for (i = first; i < Math.min(n, first + ms); i++) on = Math.max(on, Math.abs(d[i]));
      for (i = Math.max(0, last - ms); i <= last; i++) off = Math.max(off, Math.abs(d[i]));
    });
    return { jump: +jump.toFixed(3), jumpAt: +(jumpAt / sr).toFixed(3), spikes: spikes, spikeAt: where, clip: clip, peak: +db(peak).toFixed(1), tp: +db(tp).toFixed(1), dc: +(dc / (n * ch.length)).toFixed(5),
      on: +db(on).toFixed(0), off: last >= n - 2 ? null : +db(off).toFixed(0), dur: +(n / sr).toFixed(1) };
  }
  // render one thing through Snd._measure and count its nodes
  function render(fn, sec) {
    patch(); rec = { nodes: 0, srcs: [] }; var r0 = rec, t0 = performance.now();
    return Snd._measure(fn, sec, { defaults: true }).then(function (b) {
      rec = null; var row = analyze(b); row.nodes = r0.nodes; row.srcs = peakSources(r0.srcs, sec + 1); row.ms = Math.round(performance.now() - t0);
      if (window.SoundMeter) { var m = SoundMeter.analyze(b); row.mMax = m.mMax; row.hf = m.hf; }
      return row;
    }, function (e) { rec = null; throw e; });
  }
  function needSC() {
    if (window.SoundCheck) return Promise.resolve();
    return new Promise(function (res) { var s = document.createElement('script'); s.src = 'js/soundcheck.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); });
  }
  var EXTRA = {
    // the birthday song (choir + waltz) as the show plays it, into the music bus
    'birthday.song': { sec: 17, run: function (a) {
      if (!window.BirthdaySfx) return;
      if (BirthdaySfx._into) BirthdaySfx._into(a.ctx, a.bus('music'), 1.6); else BirthdaySfx.song(plan(0.56), 0, { ctx: a.ctx, dest: a.bus('music'), k: 1.6 });
    } }
  };
  // a copy of js/three/birthday.js songPlan (for the old birthday-sfx.js, which has no plan of its own)
  function plan(beat) {
    var TUNE = [[67, .75, 'a'], [67, .25, 'ee'], [69, 1, 'er'], [67, 1, 'eh'], [72, 1, 'oo'], [71, 2, 'oo'], [67, .75, 'a'], [67, .25, 'ee'], [69, 1, 'er'], [67, 1, 'eh'], [74, 1, 'oo'], [72, 2, 'oo'],
      [67, .75, 'a'], [67, .25, 'ee'], [79, 1, 'er'], [76, 1, 'eh'], [72, 1, 'ee'], [71, 1, 'i'], [69, 3, 'a'], [77, .75, 'a'], [77, .25, 'ee'], [76, 1, 'er'], [72, 1, 'eh'], [74, 1, 'oo'], [72, 3, 'oo']];
    var CHORDS = [[1, 'C'], [4, 'G'], [7, 'G'], [10, 'C'], [13, 'C7'], [16, 'F'], [20, 'C'], [23, 'G'], [24, 'C']];
    var CH = { C: [48, [64, 67, 72]], G: [43, [62, 65, 71]], C7: [48, [64, 70, 72]], F: [41, [65, 69, 72]] };
    var t = 0, notes = TUNE.map(function (n) { var o = { t: t, d: n[1] * beat, m: n[0], v: n[2] }; t += n[1] * beat; return o; });
    var chords = CHORDS.map(function (c, i) { var nb = i + 1 < CHORDS.length ? CHORDS[i + 1][0] - c[0] : 2, d = CH[c[1]]; return { t: c[0] * beat, beats: Math.max(1, Math.min(3, nb)), bass: d[0], notes: d[1] }; });
    return { notes: notes, chords: chords, beat: beat, total: t };
  }
  function run(ids) {
    return needSC().then(function () {
      var todo = SoundCheck.list.filter(function (x) { return x.off && (!ids || ids.indexOf(x.id) >= 0); }).map(function (x) { return { id: x.id, sec: x.sec, run: function (a) { x.off(a); } }; });
      Object.keys(SoundCheck.SCENES).forEach(function (k) { var s = SoundCheck.SCENES[k]; if (!ids || ids.indexOf('scene.' + k) >= 0) todo.push({ id: 'scene.' + k, sec: s.sec, run: s.run }); });
      Object.keys(EXTRA).forEach(function (k) { if (todo.some(function (x) { return x.id === k; })) return; if (!ids || ids.indexOf(k) >= 0) todo.push({ id: k, sec: EXTRA[k].sec, run: EXTRA[k].run }); });
      var out = [], i = 0;
      return new Promise(function (res) {
        (function next() {
          if (i >= todo.length) { res(out); return; }
          var it = todo[i++];
          render(it.run, it.sec).then(function (r) { r.id = it.id; out.push(r); }, function (e) { out.push({ id: it.id, err: String(e && e.message || e) }); }).then(function () { Promise.resolve().then(next); });
        })();
      });
    });
  }
  function table(rows) {
    var h = '| Sound | M-max | peak | true peak | clip >0.99 | max jump | click spikes | DC | onset dB | end dB | peak sources | nodes | render ms |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
    return h + rows.map(function (r) { return r.err ? '| ' + r.id + ' | error: ' + r.err + ' |' : '| ' + [r.id, r.mMax, r.peak, r.tp, r.clip, r.jump, r.spikes, r.dc, r.on, r.off == null ? 'cut' : r.off, r.srcs, r.nodes, r.ms].join(' | ') + ' |'; }).join('\n');
  }
  return { run: run, table: table, analyze: analyze, render: render, EXTRA: EXTRA };
})();
