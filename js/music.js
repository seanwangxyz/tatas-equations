'use strict';
// ======================= MUSIC: the adaptive score and the creature leitmotifs (docs/handoff/music.md) =======================
// Loaded on demand by js/sound.js (Snd makes a <script src="js/music.js"> on its first use; until it arrives the older
// built-in bed plays). Everything is synthesised on Snd's one AudioContext and goes through Snd's music layers
// (pad / pluck / bass / perc / tens), so the music volume, Mute, ducking and the limiter all apply.
//
// THE THEME. One original 8-bar tune in C major, written as scale degrees so it can be sung in any mode. Its first
// bars are the title fanfare's own notes (G C E ... E G A G | F A C), so the opening, the menu and the matches share
// one tune. Cells of the theme (head G-C-E-D-E, arch E-G-A-G, rise F-A-C, turn B-G-B-D) feed the match melodies and
// the 15 creature motifs.
//
// FLAVOURS (instrumentation / mode / tempo, never a new tune):
//   league  Classic: C major (Ionian), kalimba, warm pad, round bass, 88 bpm
//           Messy (Monster League): C Mixolydian (B flat), pizzicato + bassoon, reedy organ pad, swung, 96 bpm
//           Legend: C Lydian (F sharp), celesta + harp, string pad, long bass, 78 bpm
//   venue   day stadium: brushes; night: vibraphone, no kick, slower, darker; beach: steel drum + shaker, swung;
//           volcano: low marimba + log-drum pulse; other mats: no drums
//   late    after 19:30 or before 6:30 on the device clock: a music-box lullaby, slower, softer, no drums
//   On-Sets the theme as a waltz (3/4), harp and clarinet
// MOODS menu: the whole theme, then gentle development, then a varied return, then rest; play: calmer, the theme
//   mostly in fragments; think: no pulse, long chords, a few unhurried notes, silence allowed; challenge: minor,
//   low and soft; win: the theme in full. Resources running low add a soft bass pulse and a little more motion.
//   Every match gets its own seed (sections, progressions, motif choices differ; the same match repeats nothing).
//
//   Music.attach(host)             sound.js passes its helpers (ctx, layers, track, ...)
//   Music.bar(t, n, mood) -> sec   schedules one bar at audio time t and returns its length (tempo and meter vary)
//   Music.coda(kind)               'win' | 'loss' | 'shakeGood' | 'shakeKind' | 'challengeRight' | 'challengeWrong'
//   Music.motif(id, how) -> sec    creature leitmotif; how: 'enter' | 'win' | 'beaten'; id = creature id or kind
//   Music.flavour(mood)            what is playing now: { league, venue, late, onsets, bpm, mode, lead, ... }
//   Music._log(on) / _events()     note-event log (pitch names, times) for checking the music on paper
var Music = (function () {
  var H = null;
  function C() { return H.ctx(); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  function nname(m) { m = Math.round(m); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

  // ---------------------------------------------------------------- seeded randomness (one seed per match)
  var rs = 12345, seedOf = null, seedN = 0;
  function reseed(s) { rs = (s >>> 0) || 1; }
  function R() { rs = (rs + 0x6D2B79F5) | 0; var t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function Rp(a) { return a[Math.floor(R() * a.length)]; }

  // ---------------------------------------------------------------- note log (for the handoff)
  var logOn = false, events = [];
  function log(t, m, d, inst) { if (logOn && events.length < 4000) events.push({ t: +t.toFixed(3), n: nname(m), m: m, d: +d.toFixed(2), i: inst }); }

  // ---------------------------------------------------------------- one synth voice
  // o: {type|wave, f, f2, glide, t, dur, vol, att, sus, rel, lp, lp2, q, dest, detune}
  function osc(o) {
    var c = C(), t = o.t, s = c.createOscillator(), g = c.createGain(), out = g, outs = [s, g], a = o.att || 0.005, v = Math.max(0.0002, o.vol);
    if (o.wave) s.setPeriodicWave(o.wave); else s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f, t);
    if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    if (o.detune) s.detune.value = o.detune;
    g.gain.setValueAtTime(0.0001, t);
    if (o.sus) { g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + Math.max(a + 0.01, o.dur - (o.rel || 0.15))); g.gain.linearRampToValueAtTime(0.0001, t + o.dur); }
    else { g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur); }
    s.connect(g);
    if (o.lp) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q || 0.7; f.frequency.setValueAtTime(o.lp, t); if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + o.dur); g.connect(f); out = f; outs.push(f); }
    out.connect(o.dest);
    H.track(s, outs); s.start(t); s.stop(t + o.dur + 0.05);
  }
  var waves = { c: null };
  function clarWave() {
    if (waves.c !== C() || !waves.cl) { var re = new Float32Array(12), im = new Float32Array(12); for (var h = 1; h < 12; h += 2) im[h] = 1 / h; waves.cl = C().createPeriodicWave(re, im); waves.c = C(); }
    return waves.cl;
  }
  // a soft shaker hit (made once per context, low-passed so it never hisses)
  var shk = { c: null, b: null };
  function shaker() {
    if (shk.c === C() && shk.b) return shk.b;
    var c = C(), sr = c.sampleRate, n = Math.floor(sr * 0.09), b = c.createBuffer(1, n, sr), d = b.getChannelData(0), lp = 0, lp2 = 0, i, pk = 0;
    for (i = 0; i < n; i++) { var t = i / sr, w = Math.random() * 2 - 1; lp += (w - lp) * 0.35; lp2 += (lp - lp2) * 0.05; d[i] = (lp - lp2) * Math.sin(Math.PI * Math.min(1, t / 0.09)) * Math.exp(-t * 20); if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]); }
    for (i = 0; i < n; i++) d[i] *= 0.8 / (pk || 1);
    shk.c = c; shk.b = b; return b;
  }
  function buf(b, t, vol, rate, dest) {
    if (!b) return; var c = C(), s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; s.playbackRate.value = rate || 1; g.gain.value = vol; s.connect(g); g.connect(dest); H.track(s, [s, g]); s.start(t);
  }

  // ---------------------------------------------------------------- instruments (t, midi, beats-dur in seconds, velocity 0..1, dest)
  var INST = {
    kalimba: function (t, m, d, v, o) { var f = mtof(m); osc({ f: f, t: t, dur: Math.max(1.0, d), vol: 0.1 * v, att: 0.004, dest: o }); osc({ f: f * 4, t: t, dur: 0.14, vol: 0.02 * v, att: 0.003, dest: o }); },
    marimba: function (t, m, d, v, o) { var f = mtof(m); osc({ f: f, t: t, dur: 0.75, vol: 0.12 * v, att: 0.003, dest: o }); osc({ f: f * 3.9, t: t, dur: 0.07, vol: 0.022 * v, att: 0.002, dest: o }); },
    musicbox: function (t, m, d, v, o) { var f = mtof(m); osc({ f: f, t: t, dur: 1.5, vol: 0.075 * v, att: 0.003, dest: o }); osc({ f: f * 3, t: t, dur: 0.22, vol: 0.01 * v, att: 0.002, dest: o }); },
    celesta: function (t, m, d, v, o) { var f = mtof(m); osc({ f: f, t: t, dur: 1.7, vol: 0.08 * v, att: 0.003, dest: o }); osc({ f: f * 2, t: t, dur: 0.5, vol: 0.022 * v, att: 0.003, dest: o }); },
    harp: function (t, m, d, v, o) { osc({ type: 'triangle', f: mtof(m), t: t, dur: 1.6, vol: 0.1 * v, att: 0.003, lp: 2400, lp2: 500, dest: o }); },
    vibes: function (t, m, d, v, o) { var f = mtof(m); osc({ f: f, t: t, dur: 2.2, vol: 0.08 * v, att: 0.004, dest: o }); osc({ f: f * 4, t: t, dur: 0.25, vol: 0.008 * v, att: 0.003, dest: o }); },
    steel: function (t, m, d, v, o) { var f = mtof(m); osc({ f: f * 1.012, f2: f, glide: 0.04, t: t, dur: 0.95, vol: 0.09 * v, att: 0.003, dest: o }); osc({ f: f * 2.02, t: t, dur: 0.32, vol: 0.03 * v, att: 0.003, dest: o }); },
    pizz: function (t, m, d, v, o) { osc({ type: 'sawtooth', f: mtof(m), t: t, dur: 0.3, vol: 0.06 * v, att: 0.003, lp: 2000, lp2: 280, q: 1.2, dest: o }); },
    flute: function (t, m, d, v, o) { var f = mtof(m), dd = Math.max(0.25, d); osc({ f: f, t: t, dur: dd, vol: 0.06 * v, att: 0.07, sus: 1, rel: 0.12, dest: o }); osc({ type: 'triangle', f: f, t: t, dur: dd, vol: 0.012 * v, att: 0.09, sus: 1, rel: 0.12, dest: o }); },
    clarinet: function (t, m, d, v, o) { osc({ wave: clarWave(), f: mtof(m), t: t, dur: Math.max(0.25, d), vol: 0.045 * v, att: 0.05, sus: 1, rel: 0.12, lp: 1500, dest: o }); },
    horn: function (t, m, d, v, o) { osc({ type: 'sawtooth', f: mtof(m), t: t, dur: Math.max(0.3, d), vol: 0.03 * v, att: 0.07, sus: 1, rel: 0.2, lp: 700, q: 0.8, dest: o }); osc({ f: mtof(m), t: t, dur: Math.max(0.3, d), vol: 0.03 * v, att: 0.06, sus: 1, rel: 0.2, dest: o }); }
  };
  function play(inst, t, m, d, v, dest) { (INST[inst] || INST.kalimba)(t, m, d, v, dest); log(t, m, d, inst); }

  // ---------------------------------------------------------------- modes, chords, the theme
  var SCALE = { ion: [0, 2, 4, 5, 7, 9, 11], mix: [0, 2, 4, 5, 7, 9, 10], lyd: [0, 2, 4, 6, 7, 9, 11], aeo: [0, 2, 3, 5, 7, 8, 10] };
  // absolute scale degree n (0 = the tonic at `base`) -> midi
  function deg(n, mode, base) { var sc = SCALE[mode] || SCALE.ion, o = Math.floor(n / 7), k = ((n % 7) + 7) % 7; return base + 12 * o + sc[k]; }
  // the theme, in scale degrees from C5 (0 = C5): [beat, degree, beats]
  var THEME = [
    [0, -3, 0.5], [0.5, 0, 0.5], [1, 2, 1.5], [2.5, 1, 0.5], [3, 2, 1],
    [4, 4, 2], [6, 2, 1], [7, 0, 1],
    [8, -2, 0.5], [8.5, 0, 0.5], [9, 3, 1.5], [10.5, 2, 0.5], [11, 3, 1],
    [12, 5, 2], [14, 4, 2],
    [16, 2, 1], [17, 4, 1], [18, 5, 1], [19, 4, 1],
    [20, 3, 1], [21, 5, 1], [22, 7, 2],
    [24, 6, 1], [25, 4, 0.5], [25.5, 6, 0.5], [26, 8, 1], [27, 6, 1],
    [28, 7, 4]
  ];
  // its harmony: chord root degree for each half bar
  var THEME_CH = [[0, 0], [0, 5], [3, 3], [1, 4], [0, 5], [3, 3], [4, 4], [0, 0]];
  // the cells (relative degrees, beats)
  var CELLS = {
    head: { d: [0, 3, 5, 4, 5], r: [0.5, 0.5, 1.5, 0.5, 1] },
    arch: { d: [0, 2, 3, 2], r: [1, 1, 1, 1] },
    rise: { d: [0, 2, 4], r: [1, 1, 2] },
    turn: { d: [0, -2, 0, 2, 0], r: [1, 0.5, 0.5, 1, 1] },
    lean: { d: [0, -1, 0], r: [1, 1, 2] }
  };
  // per mode: chord substitutions (Lydian: the IV chord would be a diminished F#, so D major sings the F# instead)
  var SUBST = { lyd: { 3: 1 }, mix: {}, ion: {}, aeo: {} };
  var PROGS = {
    ion: [[0, 5, 3, 4, 0, 5, 1, 4], [0, 3, 0, 4, 5, 3, 4, 0], [3, 4, 2, 5, 1, 4, 0, 0], [0, 2, 3, 0, 5, 1, 4, 4]],
    mix: [[0, 6, 3, 0, 0, 6, 3, 4], [0, 3, 6, 0, 3, 6, 0, 0], [0, 6, 0, 3, 5, 6, 0, 0]],
    lyd: [[0, 1, 0, 1, 2, 1, 0, 0], [0, 1, 2, 0, 5, 1, 4, 0], [0, 4, 1, 0, 5, 1, 0, 0]],
    aeo: [[0, 5, 3, 4, 0, 5, 6, 4], [0, 3, 6, 2, 5, 3, 4, 4]]
  };
  // chord tones (midi) of degree-chord r in mode, voiced near `centre`
  function chordPcs(r, mode) { return [deg(r, mode, 0), deg(r + 2, mode, 0), deg(r + 4, mode, 0)].map(function (m) { return ((m % 12) + 12) % 12; }); }
  function isChordTone(m, r, mode) { return chordPcs(r, mode).indexOf(((m % 12) + 12) % 12) >= 0; }
  var lastVoicing = null;
  function voicing(r, mode, key, add) {
    var pcs = chordPcs(r, mode).map(function (p) { return (p + key) % 12; });
    if (add != null) pcs.push((((deg(r + add, mode, 0) + key) % 12) + 12) % 12);
    // closest voice-leading from the last voicing, notes within 53..72
    var out = [], prev = lastVoicing || [55, 60, 64, 67];
    pcs.forEach(function (pc, i) {
      var target = prev[Math.min(i, prev.length - 1)], best = null;
      for (var m = 53; m <= 72; m++) if (m % 12 === pc && (best === null || Math.abs(m - target) < Math.abs(best - target))) best = m;
      out.push(best);
    });
    out.sort(function (a, b) { return a - b; });
    lastVoicing = out; return out;
  }

  // ---------------------------------------------------------------- what is playing: league, venue, time of day
  function gv(name) { try { return typeof window !== 'undefined' ? window[name] : undefined; } catch (e) { return undefined; } }
  function settings() { var s = gv('S'); return s && typeof s === 'object' ? s : null; }
  function game() { var g = gv('G'); if (g && g.players) return g; var og = gv('OG'); if (og && og.players) return og; return null; }
  function leagueNow() {
    var g = game(), ops = gv('OPPONENTS'); if (!g || !ops) return 0;
    for (var i = 0; i < g.players.length; i++) { var a = g.players[i] && g.players[i].ai; if (a) { var k = ops.indexOf(a); if (k >= 0) return Math.floor(k / 5); } }
    return 0;
  }
  var lateOverride = null;
  function isLate() {
    if (lateOverride !== null) return lateOverride;
    var d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    return m >= 19 * 60 + 30 || m < 6 * 60 + 30;
  }
  var force = null;   // Sound check / tests: { league, venue, late, onsets }
  var LEAGUES = [
    { name: 'Classic', bpm: 88, mode: 'ion', lead: 'kalimba', lead2: 'marimba', pad: 'warm', bass: 'round', swing: 0.5 },
    { name: 'Messy', bpm: 96, mode: 'mix', lead: 'pizz', lead2: 'marimba', pad: 'organ', bass: 'bassoon', swing: 0.6 },
    { name: 'Legend', bpm: 78, mode: 'lyd', lead: 'celesta', lead2: 'harp', pad: 'strings', bass: 'long', swing: 0.5 }
  ];
  var VENUES = {
    home: { perc: 'brush', bpm: 0 }, day: { perc: 'brush', bpm: 0 },
    night: { perc: 'night', bpm: -6, lead: 'vibes', dark: 0.7 },
    beach: { perc: 'beach', bpm: 4, lead: 'steel', swing: 0.6 },
    volcano: { perc: 'volcano', bpm: 0, lead: 'marimba', low: true },
    room: { perc: 'none', bpm: -4 }
  };
  function venueNow() {
    var s = settings(), g = game(); if (!g || !s || !s.cos) return 'home';
    var m = s.cos.mat;
    if (m === 'night' || m === 'beach' || m === 'volcano') return m;
    if (m === 'stadium') { var w = s.wx && s.wx.cur; return w && (w.time === 'night' || w.time === 'dusk') ? 'night' : 'day'; }
    return 'room';
  }
  function onsetsNow() { var og = gv('OG'), g = gv('G'); return !!(og && og.players && !(g && g.players)) || gv('current') === 'onsets'; }
  function flavour(mood) {
    var f = force || {}, lg = f.league != null ? f.league : leagueNow(), vn = f.venue || venueNow(), late = f.late != null ? f.late : isLate(), os = f.onsets != null ? f.onsets : onsetsNow();
    var L0 = LEAGUES[lg] || LEAGUES[0], V = VENUES[vn] || VENUES.day;
    var o = { league: lg, leagueName: L0.name, venue: vn, late: late, onsets: os, mode: L0.mode, pad: L0.pad, bass: L0.bass, lead: V.lead || L0.lead, lead2: L0.lead2,
      perc: V.perc, swing: V.swing || L0.swing, bpm: L0.bpm + V.bpm, beats: 4, dark: V.dark || 1, low: !!V.low, mul: 1 };
    if (os) { o.beats = 3; o.bpm = 116; o.lead = 'harp'; o.lead2 = 'clarinet'; o.pad = 'warm'; o.bass = 'waltz'; o.perc = 'none'; o.swing = 0.5; o.mode = 'ion'; }
    if (mood === 'challenge') { o.mode = 'aeo'; o.bpm = 84; o.beats = 4; }
    if (late) { o.bpm = Math.round(o.bpm * 0.85); o.lead = 'musicbox'; o.perc = 'none'; o.dark *= 0.7; o.mul = 0.75; o.swing = 0.5; }
    if (mood === 'menu' && !os) o.perc = 'none';
    return o;
  }
  // 0 = plenty of Resources left .. 1 = almost none: gentle extra motion, never a ticking clock
  var tensOverride = null;
  function tension() {
    if (tensOverride !== null) return tensOverride;
    var g = game(); if (!g || !g.cubes || !g.cubes.length || g.phase === 'over') return 0;
    var n = 0; for (var i = 0; i < g.cubes.length; i++) if (g.cubes[i].zone === 'resources') n++;
    var fr = n / g.cubes.length; return Math.max(0, Math.min(1, (0.55 - fr) / 0.45));
  }

  // ---------------------------------------------------------------- the form: sections of a few bars
  var sec = null, secBar = 0, lastMood = null, lastLead = 4;
  function newSeedIfNewMatch() {
    var g = game();
    if (g !== seedOf) { seedOf = g; seedN++; reseed(((Date.now() & 0xffffff) ^ Math.imul(seedN, 2654435761)) >>> 0); sec = null; }
  }
  function pickSection(mood, F) {
    var s, nx = sec && sec.next;
    if (mood === 'menu' || mood === 'win') {
      // the theme, a development, the theme varied, a breath
      if (!nx || nx === 'theme' || (sec && sec.mood !== mood)) s = { type: 'theme', bars: 8, next: 'dev', vary: mood === 'win' ? 1 : 0 };
      else if (nx === 'dev') s = { type: 'dev', bars: 8, next: 'theme2', key: R() < 0.4 ? 5 : 0 };
      else if (nx === 'theme2') s = { type: 'theme', bars: 8, next: 'rest', vary: 1 + Math.floor(R() * 3) };
      else s = { type: 'rest', bars: mood === 'win' ? 2 : 4, next: 'theme' };
    } else if (mood === 'think') s = { type: 'think', bars: 8 };
    else if (mood === 'challenge') s = { type: 'tense', bars: 4 };
    else {
      // play: mostly fragments; now and then a quiet quote of the theme; a short rest so it can breathe
      var r = R(), last = sec && sec.type;
      if (last !== 'quote' && r < 0.25) s = { type: 'quote', bars: 4, from: Rp([0, 0, 16]) };
      else if (last !== 'rest' && last && r < 0.38) s = { type: 'rest', bars: 2 };
      else s = { type: 'dev', bars: 8, key: R() < 0.25 ? 5 : 0 };
    }
    s.mood = mood;
    s.prog = Rp(PROGS[F.mode] || PROGS.ion);
    s.key = s.key || 0;
    s.density = mood === 'play' ? 0.5 + 0.2 * R() : mood === 'think' ? 0.3 : 0.6;
    s.cells = [Rp(['head', 'arch', 'rise', 'turn', 'lean']), Rp(['head', 'arch', 'rise', 'turn'])];
    s.inv = R() < 0.3;
    return s;
  }

  // ---------------------------------------------------------------- one bar
  var HIGH = { kalimba: 1, celesta: 1, musicbox: 1 };
  function leadBase(inst, key) { return (HIGH[inst] ? 72 : 60) + key; }
  // the theme's notes for bar b (0..7), re-timed into `beats` beats (On-Sets: a waltz variation)
  var WALTZ = { 1: [3], 2: [2, 1], 3: [1, 1, 1], 4: [1, 0.5, 0.5, 1], 5: [0.5, 0.5, 1, 0.5, 0.5] };
  function themeBar(b, beats) {
    var lo = b * 4, hi = lo + 4, ns = THEME.filter(function (x) { return x[0] >= lo && x[0] < hi; }).map(function (x) { return [x[0] - lo, x[1], x[2]]; });
    if (beats === 4) return ns;
    var rr = WALTZ[ns.length] || WALTZ[4], at = 0;
    return ns.map(function (x, i) { var d = rr[i] || 0.5, o = [at, x[1], d]; at += d; return o; });
  }
  function subst(r, mode) { var s = SUBST[mode] || {}; return s[r] != null ? s[r] : r; }
  function chordsFor(b, F) {
    var t = sec.type, prog = sec.prog;
    if (t === 'theme' || t === 'quote') { var tb = t === 'quote' ? ((sec.from / 4) + b) % 8 : b % 8, h = THEME_CH[tb]; return [subst(h[0], F.mode), subst(h[1], F.mode)]; }
    if (t === 'think') { var c = prog[Math.floor(b / 2) % 8]; return [c, c]; }
    var r = prog[b % prog.length]; return [r, r];
  }
  function bar(t, n, mood) {
    newSeedIfNewMatch();
    var F = flavour(mood), beat = 60 / F.bpm, len = beat * F.beats;
    if (!sec || secBar >= sec.bars || sec.mood !== mood) { sec = pickSection(mood, F); secBar = 0; }
    var b = secBar++, key = mood === 'challenge' ? -3 : sec.key, mode = F.mode, ch = chordsFor(b, F);
    var tens = (mood === 'play' || mood === 'think') ? tension() : 0, mul = F.mul;
    var lay = { pad: H.layer('pad'), lead: H.layer('pluck'), bass: H.layer('bass'), perc: H.layer('perc'), tens: H.layer('tens') };
    H.echo(beat * 0.75, t);
    function bt(x) { var w = Math.floor(x * 2) % 2 === 1 && Math.abs(x * 2 - Math.round(x * 2)) < 0.01 ? (F.swing - 0.5) * beat : 0; return t + x * beat + w; }
    // ---- pad
    var think = sec.type === 'think';
    if (sec.type !== 'tense' && (!think || b % 2 === 0)) {
      var plen = (think ? 2 * len : len) + 1.4, add = F.pad === 'strings' && R() < 0.5 ? 6 : (tens > 0.5 ? 1 : null);
      padChord(t, plen, voicing(ch[0], mode, key, add), F, tens, mul * (sec.type === 'rest' ? 0.85 : 1), lay.pad, think);
      if (ch[1] !== ch[0]) padChord(t + len / 2, plen - len / 2, voicing(ch[1], mode, key, null), F, tens, mul * 0.7, lay.pad, false);
    }
    // ---- bass
    if (sec.type !== 'tense') bassBar(t, beat, len, ch, mode, key, F, tens, think ? (b % 2 === 0 ? 'think' : 'none') : F.bass, mul, lay.bass, bt);
    // ---- melody
    if (sec.type === 'theme' || sec.type === 'quote') themeMelody(b, F, key, mood, mul, lay.lead, bt, beat);
    else if (sec.type === 'dev') devMelody(b, F, key, ch, mul * 0.9, lay.lead, bt, beat, Math.min(0.95, sec.density + 0.2 * tens));
    else if (think) thinkMelody(b, F, key, ch, mul, lay.lead, t, beat, len);
    if (F.bass === 'waltz' && sec.type !== 'tense') { var vc = voicing(ch[0], mode, key, null); [1, 2].forEach(function (k) { vc.slice(1).forEach(function (m) { play('harp', t + k * beat, m, 0.4, 0.28 * mul, lay.lead); }); }); }
    // ---- drums (the venue's kit)
    if (sec.type !== 'tense' && !think && F.beats === 4) percBar(F, beat, mul, lay.perc, bt, tens);
    // ---- challenge: low drone, soft heartbeat, an ostinato made of the theme's head in minor
    if (sec.type === 'tense') tenseBar(t, beat, len, ch, key, mul, lay.tens, bt);
    lastMood = mood;
    return len;
  }
  function padChord(t, len, notes, F, tens, mul, dest, think) {
    var c = C(), pg = c.createGain(), pf = c.createBiquadFilter(), top = (F.pad === 'strings' ? 950 : F.pad === 'organ' ? 850 : 1100) * F.dark + 300 * tens;
    pf.type = 'lowpass'; pf.Q.value = 0.4; pf.frequency.setValueAtTime(500, t); pf.frequency.linearRampToValueAtTime(top, t + len * 0.45); pf.frequency.linearRampToValueAtTime(550, t + len);
    var att = think ? 1.6 : 0.9;
    pg.gain.setValueAtTime(0.0001, t); pg.gain.linearRampToValueAtTime(mul, t + att); pg.gain.setValueAtTime(mul, t + Math.max(att + 0.05, len - 1.5)); pg.gain.linearRampToValueAtTime(0.0001, t + len);
    pg.connect(pf); pf.connect(dest);
    notes.forEach(function (m, i) {
      var f = mtof(m), v = i === 0 ? 1.15 : 1, parts;
      if (F.pad === 'strings') parts = [['sawtooth', f, 0.0105 * v, -8], ['sawtooth', f, 0.0105 * v, 8]];
      else if (F.pad === 'organ') parts = [['square', f, 0.0075 * v, -5], ['triangle', f * 2, 0.012 * v, 6]];
      else parts = [['triangle', f, 0.026 * v, -4], ['sine', f * 2, 0.008 * v, 5]];
      parts.forEach(function (p) { var o = c.createOscillator(), og = c.createGain(); o.type = p[0]; o.frequency.value = p[1]; o.detune.value = p[3]; og.gain.value = p[2]; o.connect(og); og.connect(pg); H.track(o, [o, og]); o.start(t); o.stop(t + len + 0.05); });
      log(t, m, len, 'pad:' + F.pad);
    });
    H.release([pg, pf], t + len + 0.3);
  }
  function bassBar(t, beat, len, ch, mode, key, F, tens, kind, mul, dest, bt) {
    var r = ch[0], root = deg(r, mode, 36 + key), fifth = deg(r + 4, mode, 36 + key);
    while (root > 47) root -= 12; while (root < 36) root += 12; while (fifth < root) fifth += 12;
    function sine(at, m, d, v) { osc({ f: mtof(m), t: at, dur: d, vol: v * mul, att: 0.012, dest: dest }); osc({ type: 'triangle', f: mtof(m) * 2, t: at, dur: d * 0.6, vol: v * 0.3 * mul, att: 0.012, lp: 500, dest: dest }); log(at, m, d, 'bass'); }
    if (kind === 'round') { sine(t, root, 1.5 * beat, 0.15); sine(bt(2), ch[1] !== ch[0] ? deg(ch[1], mode, 36 + key) % 12 + 36 : fifth, 1.2 * beat, 0.11); }
    else if (kind === 'bassoon') {
      [[0, root], [2, fifth]].forEach(function (x) { osc({ wave: clarWave(), f: mtof(x[1]), t: bt(x[0]), dur: 0.8 * beat, vol: 0.06 * mul, att: 0.02, sus: 1, rel: 0.08, lp: 650, dest: dest }); log(bt(x[0]), x[1], 0.8 * beat, 'bassoon'); });
      if (R() < 0.4) { var pm = deg(r - 1, mode, 36 + key); while (pm < 36) pm += 12; osc({ wave: clarWave(), f: mtof(pm), t: bt(3.5), dur: 0.4 * beat, vol: 0.045 * mul, att: 0.015, sus: 1, rel: 0.06, lp: 650, dest: dest }); log(bt(3.5), pm, 0.4 * beat, 'bassoon'); }
    }
    else if (kind === 'long') { osc({ f: mtof(root), t: t, dur: len * 0.98, vol: 0.12 * mul, att: 0.15, sus: 1, rel: 0.4, dest: dest }); osc({ type: 'triangle', f: mtof(root) * 2, t: t, dur: len * 0.9, vol: 0.03 * mul, att: 0.2, sus: 1, rel: 0.4, lp: 400, dest: dest }); log(t, root, len, 'bass'); }
    else if (kind === 'waltz') sine(t, root, 1.2 * beat, 0.14);
    else if (kind === 'think') osc({ f: mtof(root), t: t, dur: 2 * len, vol: 0.07 * mul, att: 0.6, sus: 1, rel: 1.2, dest: dest });
    // Resources running low: a soft pulse on the root, growing a little (no ticking, no hurry)
    if (tens > 0.4 && kind !== 'none') {
      for (var i = 0; i < 8; i++) { if (i % 2 === 0 && kind !== 'think') continue; osc({ f: mtof(root), t: bt(i / 2), dur: 0.35 * beat, vol: 0.06 * tens * mul, att: 0.01, dest: dest }); }
    }
  }
  // the theme itself (menu, win), or a quiet quote of it (play)
  function themeMelody(b, F, key, mood, mul, dest, bt, beat) {
    var quote = sec.type === 'quote', tb = quote ? ((sec.from / 4) + b) % 8 : b % 8, notes = themeBar(tb, F.beats), vary = quote ? 0 : sec.vary;
    var inst = quote ? F.lead2 : (vary === 3 && b % 2 === 1 ? F.lead2 : F.lead), base = leadBase(inst, key), v = (quote ? 0.7 : 0.9) * mul;
    if (quote && b === sec.bars - 1) notes = notes.slice(0, 1).map(function (x) { return [x[0], x[1], Math.min(x[2], 2)]; });
    notes.forEach(function (x, i) {
      var m = deg(x[1], F.mode, base), d = x[2] * beat, at = bt(x[0]), acc = x[0] === 0 ? 1.1 : 1;
      if (vary === 1 && x[2] >= 1.5) {   // ornamented: a long note turns into the note and its upper neighbour
        play(inst, at, m, d * 0.5, v * acc, dest); play(inst, bt(x[0] + x[2] * 0.5), deg(x[1] + 1, F.mode, base), d * 0.25, v * 0.7, dest);
        play(inst, bt(x[0] + x[2] * 0.75), m, d * 0.25, v * 0.75, dest);
      } else play(inst, at, m, d, v * acc, dest);
      if (vary === 2 || mood === 'win') play(F.lead2, at, deg(x[1] - 2, F.mode, leadBase(F.lead2, key)), d, v * 0.55, dest);   // in thirds
      lastLead = x[1];
    });
  }
  // development: cells of the theme, called and answered, each starting on a chord tone near the last note
  var call = null;
  function cellNotes(name, startDeg, inv, aug, beats) {
    var c = CELLS[name], at = 0, out = [];
    for (var i = 0; i < c.d.length; i++) { var d = c.r[i] * aug * (beats === 3 ? 0.75 : 1); out.push([at, startDeg + (inv ? -c.d[i] : c.d[i]), d]); at += d; }
    return out;
  }
  function nearestChordDeg(target, r) { var best = target, bd = 99; for (var d = target - 3; d <= target + 3; d++) { var k = (((d - r) % 7) + 7) % 7; if ((k === 0 || k === 2 || k === 4) && Math.abs(d - target) < bd) { bd = Math.abs(d - target); best = d; } } return best; }
  function devMelody(b, F, key, ch, mul, dest, bt, beat, density) {
    var unit = b % 4, inst = F.lead, base = leadBase(inst, key), span = F.beats * 2;
    if (unit === 0) {
      call = null; if (R() > density) return;
      var name = sec.cells[(b >> 2) % 2], st = nearestChordDeg(Math.max(-3, Math.min(5, lastLead)), ch[0]), off = Rp([0, 0, 0.5, 1]);
      call = { name: name, notes: cellNotes(name, st, false, 1, F.beats), off: off };
      emit(call.notes, off);
    } else if (unit === 2 && call) {
      if (R() > density + 0.25) return;
      // the answer: same rhythm, moved a step (or turned upside down), ending on a chord tone
      var sh = sec.inv ? 0 : Rp([-1, 1, 2]), ns = sec.inv ? cellNotes(call.name, call.notes[0][1], true, 1, F.beats) : call.notes.map(function (x) { return [x[0], x[1] + sh, x[2]]; });
      var last = ns[ns.length - 1]; last[1] = nearestChordDeg(last[1], ch[0]);
      emit(ns, call.off);
    }
    function emit(ns, off) {
      ns.forEach(function (x, i) {
        if (x[0] + off >= span) return;
        var d = Math.min(x[2], span - x[0] - off) * beat;
        play(inst, bt(x[0] + off), deg(x[1], F.mode, base), d, (i === 0 ? 0.85 : 0.72) * mul * (0.9 + 0.2 * R()), dest); lastLead = x[1];
      });
    }
  }
  // thinking: no pulse; now and then two or three unhurried notes, off the grid; silence is fine
  function thinkMelody(b, F, key, ch, mul, dest, t, beat, len) {
    if (R() > 0.42) return;
    var inst = F.lead === 'pizz' ? 'marimba' : F.lead, base = leadBase(inst, key), name = Rp(['arch', 'rise', 'lean', 'head']);
    var ns = cellNotes(name, nearestChordDeg(Math.max(-4, Math.min(2, lastLead)), ch[0]), R() < 0.3, 2, 4).slice(0, 1 + Math.floor(R() * 3)), at = t + R() * 1.5 * beat;
    ns.forEach(function (x) { var tt = at + x[0] * beat * (0.85 + 0.3 * R()); if (tt - t < len * 1.9) play(inst, tt, deg(x[1], F.mode, base), x[2] * beat, 0.6 * mul, dest); lastLead = x[1]; });
  }
  function percBar(F, beat, mul, dest, bt, tens) {
    var bk = H.bank(); if (!bk || F.perc === 'none') return;
    var i;
    if (F.perc === 'brush') {
      buf(bk.kick, bt(0), 0.32 * mul, 1, dest); buf(bk.kick, bt(2), 0.26 * mul, 1, dest);
      for (i = 0; i < 8; i++) { if (i === 0 || i === 4) continue; buf(bk.brush, bt(i / 2), (i % 2 ? 0.06 : 0.14) * (0.7 + 0.3 * R()) * mul, 0.95 + 0.15 * R(), dest); }
    } else if (F.perc === 'night') {
      if (R() < 0.5) buf(bk.kick, bt(0), 0.16 * mul, 0.9, dest);
      buf(bk.brush, bt(1), 0.12 * mul, 0.8, dest); buf(bk.brush, bt(3), 0.12 * mul, 0.8, dest);
    } else if (F.perc === 'beach') {
      var sh = shaker(); for (i = 0; i < 8; i++) buf(sh, bt(i / 2), (i % 2 ? 0.09 : 0.16) * (0.8 + 0.3 * R()) * mul, 1, dest);
      [0, 1.5, 2.5, 3].forEach(function (x, k) { buf(bk.tom, bt(x), (k === 0 ? 0.16 : 0.1) * mul, 2.1 + (k % 2) * 0.35, dest); });
    } else if (F.perc === 'volcano') {
      buf(bk.tomLow, bt(0), 0.3 * mul, 1, dest); buf(bk.tomLow, bt(2.5), 0.2 * mul, 1, dest); buf(bk.tom, bt(3.5), 0.1 * mul, 1.6, dest);
      for (i = 1; i < 8; i += 2) buf(bk.brush, bt(i / 2), 0.05 * mul, 0.8, dest);
    }
  }
  function tenseBar(t, beat, len, ch, key, mul, dest, bt) {
    var c = C(), root = deg(ch[0], 'aeo', 33 + 12 + key + 3), tg = c.createGain(), tf = c.createBiquadFilter(), tl = len + 1.2, df = mtof(root - 12);
    while (df > 90) df /= 2;
    tf.type = 'lowpass'; tf.frequency.value = 280; tf.Q.value = 0.6;
    tg.gain.setValueAtTime(0.0001, t); tg.gain.linearRampToValueAtTime(0.055 * mul, t + 0.8); tg.gain.setValueAtTime(0.055 * mul, t + len - 0.1); tg.gain.linearRampToValueAtTime(0.0001, t + tl);
    tg.connect(tf); tf.connect(dest);
    [[df, -8, 'sawtooth'], [df, 8, 'sawtooth'], [df * 1.5, 0, 'triangle']].forEach(function (d) { var o = c.createOscillator(); o.type = d[2]; o.frequency.value = d[0]; o.detune.value = d[1]; o.connect(tg); H.track(o, [o]); o.start(t); o.stop(t + tl + 0.05); });
    H.release([tg, tf], t + tl + 0.3);
    var bk = H.bank(); if (bk) [0, 2].forEach(function (x) { buf(bk.tom, bt(x), 0.24 * mul, 1, dest); buf(bk.tomLow, bt(x) + 0.2, 0.14 * mul, 1, dest); });
    // the theme's head (G C E D E) in A minor, low and muted: A D F E F
    var head = [[0, 0], [1, 3], [1.5, 5], [2.5, 4], [3, 5]], base = 57 + key + 3;
    head.forEach(function (x, i) { var m = deg(ch[0] + x[1], 'aeo', base - 12); while (m > 64) m -= 12; osc({ type: 'triangle', f: mtof(m), t: bt(x[0]), dur: 0.32, vol: (i === 0 ? 0.06 : 0.042) * mul, att: 0.006, lp: 800, dest: dest }); log(bt(x[0]), m, 0.32, 'ostinato'); });
  }

  // ---------------------------------------------------------------- codas (on the sting bus: part of the music, follow its volume)
  // each: melody [beat, degree from C5, beats], chords [beat, root degree, beats], bass [beat, midi, beats]
  var CODAS = {
    // warm and proud: the theme's last phrase, broad, after the fanfare's big chord (F A C | B G B D | C)
    win: { delay: 1.9, bpm: 100, inst: 'celesta', dbl: 'horn', vol: 1,
      mel: [[0, 3, 0.5], [0.5, 5, 0.5], [1, 7, 1], [2, 6, 0.5], [2.5, 4, 0.5], [3, 6, 0.5], [3.5, 8, 0.5], [4, 7, 3.5]],
      ch: [[0, 3, 2], [2, 4, 2], [4, 0, 4]], bass: [[0, 41, 2], [2, 43, 2], [4, 36, 4]], arp: [4.5, [72, 76, 79, 84, 88]] },
    // kind and hopeful: the theme's head, a plagal "it's alright", ending up on the bright third
    loss: { delay: 0.3, bpm: 84, inst: 'musicbox', dbl: null, vol: 0.9,
      mel: [[0, -3, 0.5], [0.5, 0, 0.5], [1, 2, 1.5], [2.5, 1, 0.5], [3, 2, 1], [4, 5, 1], [5, 4, 1], [6, 2, 3]],
      ch: [[0, 0, 4], [4, 3, 2], [6, 0, 3.5]], bass: [[0, 36, 4], [4, 41, 2], [6, 36, 3.5]] },
    shakeGood: { delay: 0.35, bpm: 104, inst: null, vol: 0.75, mel: [[0, 4, 0.5], [0.5, 6, 0.5], [1, 7, 2]], ch: [[0, 4, 1], [1, 0, 2.5]], bass: [[0, 43, 1], [1, 36, 2.5]] },
    shakeKind: { delay: 0.6, bpm: 92, inst: null, vol: 0.7, mel: [[0, 5, 1], [1, 4, 2]], ch: [[0, 3, 1], [1, 0, 2.5]], bass: [[0, 41, 1], [1, 36, 2.5]] },
    challengeRight: { delay: 0.2, bpm: 100, inst: null, vol: 0.8, mel: [[0, -3, 0.5], [0.5, 0, 0.5], [1, 2, 2]], ch: [[0, 4, 1], [1, 0, 2.5]], bass: [[0, 43, 1], [1, 36, 2.5]] },
    challengeWrong: { delay: 0.5, bpm: 88, inst: null, vol: 0.7, mel: [[0, 3, 1], [1, 2, 0.5], [1.5, 0, 2]], ch: [[0, 1, 1.5], [1.5, 0, 2.5]], bass: [[0, 38, 1.5], [1.5, 36, 2.5]] }
  };
  function coda(kind, extra) {
    var cd = CODAS[kind]; if (!cd || !H || !C()) return 0;
    var F = flavour('win'), beat = 60 / (cd.bpm * (F.late ? 0.9 : 1)), t0 = C().currentTime + cd.delay + (+extra || 0), dest = H.sting(), v = cd.vol * F.mul;
    var inst = cd.inst ? (F.late ? 'musicbox' : cd.inst) : (F.lead === 'pizz' ? 'marimba' : F.lead), base = leadBase(inst, 0), end = 0;
    lastVoicing = null;
    cd.mel.forEach(function (x) { var m = deg(x[1], 'ion', base); play(inst, t0 + x[0] * beat, m, x[2] * beat, v, dest); if (cd.dbl) play(cd.dbl, t0 + x[0] * beat, m - 12, x[2] * beat, v * 0.7, dest); end = Math.max(end, x[0] + x[2]); });
    cd.ch.forEach(function (x) { padChord(t0 + x[0] * beat, x[2] * beat + 0.8, voicing(x[1], 'ion', 0, null), { pad: 'warm', dark: 1 }, 0, v * 0.9, dest, false); });
    cd.bass.forEach(function (x) { osc({ f: mtof(x[1]), t: t0 + x[0] * beat, dur: x[2] * beat, vol: 0.12 * v, att: 0.02, sus: 1, rel: 0.4, dest: dest }); log(t0 + x[0] * beat, x[1], x[2] * beat, 'bass'); });
    if (cd.arp) cd.arp[1].forEach(function (m, i) { play('harp', t0 + (cd.arp[0] + i * 0.25) * beat, m, 1, v * 0.6, dest); });
    return Math.round((cd.delay + end * beat + 0.8) * 1000);
  }

  // ---------------------------------------------------------------- creature leitmotifs (2 to 4 notes from the theme's cells)
  INST.tuba = function (t, m, d, v, o) { var f = mtof(m), dd = Math.max(0.3, d); osc({ type: 'sawtooth', f: f, t: t, dur: dd, vol: 0.05 * v, att: 0.05, sus: 1, rel: 0.2, lp: 380, dest: o }); osc({ f: f, t: t, dur: dd, vol: 0.09 * v, att: 0.05, sus: 1, rel: 0.2, dest: o }); };
  INST.xylo = function (t, m, d, v, o) { var f = mtof(m); osc({ f: f, t: t, dur: 0.45, vol: 0.12 * v, att: 0.002, dest: o }); osc({ f: f * 3, t: t, dur: 0.15, vol: 0.035 * v, att: 0.002, dest: o }); };
  INST.bassoon = function (t, m, d, v, o) { osc({ wave: clarWave(), f: mtof(m), t: t, dur: Math.max(0.25, d), vol: 0.07 * v, att: 0.03, sus: 1, rel: 0.1, lp: 600, dest: o }); };
  INST.accordion = function (t, m, d, v, o) { var f = mtof(m), dd = Math.max(0.25, d); osc({ type: 'square', f: f, t: t, dur: dd, vol: 0.02 * v, att: 0.04, sus: 1, rel: 0.1, lp: 1300, dest: o, detune: -7 }); osc({ type: 'square', f: f, t: t, dur: dd, vol: 0.02 * v, att: 0.04, sus: 1, rel: 0.1, lp: 1300, dest: o, detune: 7 }); };
  INST.bleep = function (t, m, d, v, o) { osc({ type: 'square', f: mtof(m), t: t, dur: Math.max(0.12, d * 0.8), vol: 0.025 * v, att: 0.004, sus: 1, rel: 0.03, lp: 1700, dest: o }); };
  INST.chirp = function (t, m, d, v, o) { var f = mtof(m); osc({ f: f * 0.8, f2: f, glide: 0.06, t: t, dur: Math.max(0.12, d), vol: 0.07 * v, att: 0.006, dest: o }); };
  INST.wobble = function (t, m, d, v, o) { var f = mtof(m); osc({ f: f * 0.94, f2: f, glide: 0.09, t: t, dur: Math.max(0.5, d * 1.3), vol: 0.085 * v, att: 0.01, dest: o }); osc({ f: f * 2, t: t, dur: 0.2, vol: 0.01 * v, att: 0.01, dest: o }); };
  INST.timp = function (t, m, d, v, o) { var f = mtof(m); osc({ f: f * 1.5, f2: f, glide: 0.12, t: t, dur: 0.8, vol: 0.2 * v, att: 0.003, dest: o }); };
  var KIND_ID = { sloth: 'snoozy', penguin: 'penny', fox: 'fox', owl: 'owl', wizard: 'wizard', robot: 'bleep', bat: 'flip', octopus: 'squiggle', dragon: 'nugget', chameleon: 'chroma', pip: 'pip' };
  // inst, bpm, notes [beat, midi, beats], chord (degree, under the motif), extra [inst, notes] layered
  var MOTIFS = {
    pip: { inst: 'chirp', bpm: 132, n: [[0, 79, 0.5], [0.5, 84, 0.5], [1, 88, 1]], ch: 0, vol: 1 },                                         // head G C E
    snoozy: { inst: 'tuba', bpm: 70, n: [[0, 43, 1], [1.2, 48, 1], [2.4, 52, 2, 50]], ch: 0, vol: 1 },                                     // head, slow, a yawn
    penny: { inst: 'xylo', bpm: 130, n: [[0, 76, 0.5], [0.5, 74, 0.5], [1, 76, 0.5], [1.5, 79, 1]], ch: 0, vol: 1 },                        // lean + up
    fox: { inst: 'pizz', bpm: 112, n: [[0, 67, 0.5], [0.75, 72, 0.5], [1.5, 75, 0.12], [1.62, 76, 1]], ch: 0, vol: 1 },                     // head, tiptoe, a sly grace note
    owl: { inst: 'clarinet', bpm: 92, n: [[0, 64, 0.6], [0.75, 67, 0.6], [1.5, 69, 0.6], [2.25, 67, 1.6]], ch: 0, vol: 1 },                  // arch: hoo hoo hoo-oo
    wizard: { inst: 'celesta', bpm: 100, n: [[0, 65, 0.5], [0.5, 69, 0.5], [1, 72, 0.5], [1.5, 76, 2]], ch: 3, drone: 41, vol: 1 },          // rise, sparkling
    grub: { inst: 'bassoon', bpm: 96, n: [[0, 48, 0.7], [0.8, 43, 0.7], [1.6, 46, 1.2]], ch: 6, mode: 'mix', vol: 1 },                       // head turned grumpy, B flat
    splosh: { inst: 'marimba', bpm: 104, n: [[0, 60, 0.5], [0.75, 62, 0.5], [1.5, 64, 0.5], [2.5, 60, 1]], ch: 0, vol: 1 },                  // careful steps
    blaze: { inst: 'horn', bpm: 150, n: [[0, 67, 0.25], [0.25, 72, 0.25], [0.5, 76, 0.25], [0.75, 79, 1]], ch: 0, vol: 1 },                  // head, quick as a spark
    hex: { inst: 'accordion', bpm: 110, n: [[0, 64, 0.5], [0.5, 62, 0.5], [1, 64, 0.5], [1.5, 70, 1.2]], ch: 6, mode: 'mix', vol: 1 },       // lean, then a tricky B flat
    zog: { inst: 'tuba', bpm: 112, n: [[0, 48, 0.5], [1, 55, 0.5], [2, 52, 0.5], [3, 48, 1.5]], ch: 0, extra: ['pizz', [[0.5, 67], [1.5, 70], [2.5, 67]]], vol: 1 },   // oom-pah king
    bleep: { inst: 'bleep', bpm: 140, n: [[0, 72, 0.25], [0.25, 76, 0.25], [0.5, 79, 0.25], [0.75, 84, 0.25], [1.25, 84, 0.12], [1.5, 84, 0.6]], ch: 0, vol: 1 }, // rise, with a glitch
    flip: { inst: 'flute', bpm: 96, n: [[0, 84, 0.6], [0.6, 79, 0.6], [1.2, 76, 1.4]], ch: 0, vol: 1 },                                     // head upside down
    squiggle: { inst: 'wobble', bpm: 104, n: [[0, 64, 0.5], [0.5, 67, 0.5], [1, 69, 0.5], [1.5, 67, 1.2]], ch: 5, vol: 1 },                  // arch, wobbly
    nugget: { inst: 'horn', bpm: 84, n: [[0, 55, 0.8], [0.8, 60, 0.8], [1.6, 64, 2]], ch: 0, extra: ['timp', [[0, 36], [1.6, 36]]], vol: 1 }, // head, a dragon's horn call
    chroma: { inst: 'harp', bpm: 120, n: [[0, 65, 0.4], [0.33, 69, 0.4], [0.66, 72, 0.4], [1, 76, 0.8], [1.8, 65, 0.4], [2.13, 68, 0.4], [2.46, 72, 0.4], [2.8, 75, 0.4], [3.2, 76, 1.2]], ch: 3, vol: 1 } // rise, changing colour
  };
  // level trims from the offline audit (docs/handoff/music.md): each motif about -21 LUFS
  var MTRIM = { pip: 2.57, snoozy: 0.67, penny: 1.46, fox: 2.8, owl: 1.45, wizard: 0.9, splosh: 1.51, blaze: 1.74, hex: 1.88, zog: 0.72, bleep: 2.2, flip: 1.15, squiggle: 1.84, nugget: 1.3 };
  function motifId(id) { return MOTIFS[id] ? id : (KIND_ID[id] || 'pip'); }
  function motif(id, how) {
    if (!H || !C()) return 0;
    id = motifId(id); how = how || 'enter';
    var mo = MOTIFS[id], sp = how === 'win' ? 1.12 : how === 'beaten' ? 0.82 : 1, beat = 60 / (mo.bpm * sp), t0 = C().currentTime + 0.05, dest = H.out('motif');
    var v = (mo.vol || 1) * (MTRIM[id] || 1) * (how === 'beaten' ? 0.8 : 1), up = how === 'win' ? 5 : 0, end = 0, mode = mo.mode || 'ion';
    function phrase(at, shift, vv) {
      mo.n.forEach(function (x, i) {
        var m = x[1] + shift, tt = at + x[0] * beat, d = x[2] * beat;
        play(mo.inst, tt, m, d, vv * (i === 0 ? 1.08 : 1), dest);
        if (x[3]) { /* a glide at the end (the sloth's yawn) */ osc({ f: mtof(m), f2: mtof(x[3] + shift), glide: d, t: tt + d * 0.4, dur: d, vol: 0.03 * vv, att: 0.2, sus: 1, rel: 0.4, lp: 500, type: 'sawtooth', dest: dest }); }
        end = Math.max(end, (tt - t0) + d);
      });
      if (mo.extra) mo.extra[1].forEach(function (x) { play(mo.extra[0], at + x[0] * beat, x[1] + shift, 0.4 * beat, vv * 0.7, dest); });
    }
    phrase(t0, up, v);
    var mlen = mo.n[mo.n.length - 1][0] + mo.n[mo.n.length - 1][2];
    // a soft chord under it, and the drone for the wizard
    lastVoicing = null;
    padChord(t0, mlen * beat + 0.9, voicing(mo.ch, mode, up, null), { pad: 'warm', dark: 0.9 }, 0, v * 0.55, dest, false);
    if (mo.drone) osc({ f: mtof(mo.drone), t: t0, dur: mlen * beat + 1, vol: 0.08 * v, att: 0.6, sus: 1, rel: 0.6, dest: dest });
    if (how === 'enter' && mlen < 2.6) phrase(t0 + (mlen + 0.5) * beat, 0, v * 0.55);   // an echo: the motif again, softer
    if (how === 'beaten') {   // a friendly shrug at the end: the major sixth chord, never a sad trombone
      var tb = t0 + (mlen + 0.2) * beat; play('harp', tb, 69 + up, 1, v * 0.6, dest); play('harp', tb + 0.1, 72 + up, 1, v * 0.6, dest); play('harp', tb + 0.2, 76 + up, 1.2, v * 0.6, dest);
      end = Math.max(end, (tb - t0) + 1.4);
    }
    return Math.round((end + 0.4) * 1000);
  }

  // ---------------------------------------------------------------- public
  return {
    attach: function (h) { H = h; },
    bar: function (t, n, mood) { return bar(t, n, mood); },
    coda: function (k, extra) { try { return coda(k, extra); } catch (e) { return 0; } },
    motif: function (id, how) { try { return motif(id, how); } catch (e) { return 0; } },
    motifIds: function () { return Object.keys(MOTIFS); },
    motifId: motifId,
    flavour: function (m) { try { return flavour(m || 'play'); } catch (e) { return null; } },
    force: function (f) { force = f || null; sec = null; },
    late: function (on) { lateOverride = on == null ? null : !!on; },
    tension: function (v) { tensOverride = v == null ? null : +v; },
    reseed: function (s) { reseed(s); sec = null; lastVoicing = null; },
    reset: function () { sec = null; lastVoicing = null; call = null; },
    _log: function (on) { logOn = !!on; if (on) events = []; },
    _events: function () { return events.slice(); },
    _mtrim: MTRIM, THEME: THEME, CELLS: CELLS, nname: nname
  };
})();
try { if (typeof Snd !== 'undefined' && Snd && Snd._attachMusic) Snd._attachMusic(Music); } catch (e) {}

