'use strict';
// ======================= SOUND METER (offline loudness / harshness / click checks) =======================
// Pure analysis of a rendered AudioBuffer (or Float32Array channels). Used by the Sound check screen (js/soundcheck.js)
// and by the sound audit in docs/handoff/sound.md. No audio is played.
//   SoundMeter.analyze(buffer) -> { dur, peakDb, lufs, mMax, rmsDb, hf, centroid, dc, clickIn, clickOut, clipped }
//     peakDb   sample peak, dBFS
//     lufs     integrated loudness, ITU-R BS.1770 K-weighting with the -70 / -10 LU gates (400 ms blocks, 75 % overlap)
//     mMax     the loudest 400 ms block (momentary max, LUFS): the best single number for a short sound
//     rmsDb    unweighted RMS over the part that is sounding, dBFS
//     hf       share of the energy above 4 kHz, % (above ~25 % sounds bright/harsh on small speakers)
//     centroid spectral centroid, Hz (brightness)
//     dc       mean sample value (DC offset)
//     clickIn  how fast the sound starts: dB reached within the first 1 ms after it begins (> -20 dBFS = may click)
//     clickOut level just before it stops dead, dB (> -40 dBFS within 1 ms of silence = may click)
//     clipped  samples at or over 0 dBFS
var SoundMeter = (function () {
  function db(x) { return x > 0 ? 20 * Math.log10(x) : -120; }
  // K-weighting biquads (BS.1770 coefficients are given for 48 kHz; for other rates they are re-derived)
  function kCoefs(sr) {
    // stage 1: high shelf (+4 dB above ~1.5 kHz)
    var f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    var K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    var a0 = 1 + K / Q + K * K;
    var s1 = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
    // stage 2: high pass (~38 Hz)
    var f1 = 38.13547087602444, Q1 = 0.5003270373238773, K1 = Math.tan(Math.PI * f1 / sr);
    var a1 = 1 + K1 / Q1 + K1 * K1;
    var s2 = { b: [1, -2, 1], a: [1, 2 * (K1 * K1 - 1) / a1, (1 - K1 / Q1 + K1 * K1) / a1] };
    return [s1, s2];
  }
  function biquad(x, c) {
    var y = new Float32Array(x.length), b0 = c.b[0], b1 = c.b[1], b2 = c.b[2], a1 = c.a[1], a2 = c.a[2], x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < x.length; i++) { var v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; }
    return y;
  }
  function fft(re, im) { // in place, radix 2
    var n = re.length, i, j = 0, k, m;
    for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (m = 2; m <= n; m <<= 1) {
      var ang = -2 * Math.PI / m, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += m) {
        var cr = 1, ci = 0;
        for (k = 0; k < m / 2; k++) {
          var a = i + k, b = a + m / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  function analyze(buf) {
    var chans = [], sr = buf.sampleRate || 48000, c;
    if (buf.getChannelData) for (c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c)); else chans = buf.channels;
    var n = chans[0].length, peak = 0, clipped = 0, dc = 0, i;
    var mono = new Float32Array(n);
    for (c = 0; c < chans.length; c++) { var d = chans[c]; for (i = 0; i < n; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= 0.9999) clipped++; dc += d[i]; mono[i] += d[i] / chans.length; } }
    dc /= n * chans.length;
    // where it sounds: first / last sample above -60 dBFS
    var thr = 0.001, first = -1, last = -1;
    for (i = 0; i < n; i++) if (Math.abs(mono[i]) > thr) { first = i; break; }
    for (i = n - 1; i >= 0; i--) if (Math.abs(mono[i]) > thr) { last = i; break; }
    if (first < 0) return { dur: 0, peakDb: -120, lufs: -120, mMax: -120, rmsDb: -120, hf: 0, centroid: 0, dc: 0, clickIn: -120, clickOut: -120, clipped: 0, silent: true };
    var ms1 = Math.max(1, Math.round(sr * 0.001)), ci = 0, co = 0, rs = 0;
    for (i = first; i < Math.min(n, first + ms1); i++) ci = Math.max(ci, Math.abs(mono[i]));
    for (i = Math.max(0, last - ms1); i <= last; i++) co = Math.max(co, Math.abs(mono[i]));
    // a sound that is still loud on the very last rendered sample was cut off by the render window, not a click
    var cutOff = last >= n - 2;
    for (i = first; i <= last; i++) rs += mono[i] * mono[i];
    var rms = Math.sqrt(rs / Math.max(1, last - first + 1));
    // loudness
    var kc = kCoefs(sr), kw = chans.map(function (d) { return biquad(biquad(d, kc[0]), kc[1]); });
    var blk = Math.round(sr * 0.4), hop = Math.round(sr * 0.1), blocks = [];
    for (var s = 0; s + blk <= Math.max(n, blk); s += hop) {
      var z = 0;
      for (c = 0; c < kw.length; c++) { var k = kw[c]; for (i = s; i < Math.min(n, s + blk); i++) z += k[i] * k[i]; }
      blocks.push(z / blk);
      if (s + blk >= n) break;
    }
    function L(z) { return -0.691 + 10 * Math.log10(Math.max(1e-12, z)); }
    var mMax = -120; blocks.forEach(function (z) { mMax = Math.max(mMax, L(z)); });
    var g1 = blocks.filter(function (z) { return L(z) > -70; }), lufs = -120;
    if (g1.length) {
      var m1 = g1.reduce(function (a, b) { return a + b; }, 0) / g1.length, rel = L(m1) - 10;
      var g2 = g1.filter(function (z) { return L(z) > rel; });
      if (g2.length) lufs = L(g2.reduce(function (a, b) { return a + b; }, 0) / g2.length);
    }
    // spectrum: average power over 2048-sample Hann frames of the sounding part
    var N = 2048, spec = new Float64Array(N / 2), frames = 0, re = new Float32Array(N), im = new Float32Array(N);
    for (var st = first; st + N <= last + N && st < n; st += N / 2) {
      for (i = 0; i < N; i++) { var v = st + i < n ? mono[st + i] : 0, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); re[i] = v * w; im[i] = 0; }
      fft(re, im); for (i = 1; i < N / 2; i++) spec[i] += re[i] * re[i] + im[i] * im[i]; frames++;
      if (frames > 400) break;
    }
    var tot = 0, hi = 0, wsum = 0, bin = sr / N;
    for (i = 1; i < N / 2; i++) { tot += spec[i]; wsum += spec[i] * i * bin; if (i * bin >= 4000) hi += spec[i]; }
    return {
      dur: +((last - first) / sr).toFixed(2), peakDb: +db(peak).toFixed(1), lufs: +lufs.toFixed(1), mMax: +mMax.toFixed(1), rmsDb: +db(rms).toFixed(1),
      hf: tot ? +(100 * hi / tot).toFixed(1) : 0, centroid: tot ? Math.round(wsum / tot) : 0, dc: +dc.toFixed(5),
      clickIn: +db(ci).toFixed(1), clickOut: cutOff ? null : +db(co).toFixed(1), clipped: clipped
    };
  }
  // flags for one analysed sound
  function flags(r) {
    var f = [];
    if (r.silent) return ['silent'];
    if (r.peakDb > -1) f.push('peak near 0 dBFS');
    if (r.clipped) f.push('clips');
    if (r.hf > 25) f.push('bright/harsh');
    if (Math.abs(r.dc) > 0.002) f.push('DC offset');
    if (r.clickIn > -20) f.push('hard start');
    if (r.clickOut != null && r.clickOut > -40) f.push('hard stop');
    return f;
  }
  return { analyze: analyze, flags: flags, db: db };
})();

// ======================= SOUND CHECK (Settings -> Sound -> Sound check) =======================
// A screen for Tata: every sound the game makes, by category, with a play button; a volume slider per category
// (saved in S.set); "Play the loudest moment"; and a flag on each sound that copies a short report to the clipboard
// to paste to the developer. "Measure every sound" renders each one offline through the real mix (no speakers) and
// fills in its loudness (loudest 400 ms, LUFS), its peak, and warnings (harsh / clicks / near clipping).
//   SoundCheck.open() / close()      (Snd.soundCheck() loads this file on demand and opens it)
//   SoundCheck.list                   the catalogue: { id, cat, label, sec, live(), off(api) }
//   SoundCheck.measure(ids?) -> Promise<[{ id, cat, label, ...SoundMeter.analyze() }]>  (no screen needed)
//   SoundCheck.scene(name) -> Promise<result>   name: 'win' | 'challenge' | 'title': worst-case pile-ups, measured
var SoundCheck = (function () {
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function save() { try { if (typeof persist === 'function') persist(); } catch (e) {} }
  function sndOK() { return typeof Snd !== 'undefined' && Snd && Snd.bus; }
  var CATS = [['ui', 'Taps and buttons'], ['sfx', 'Effects'], ['crowd', 'Crowd'], ['voice', 'Voices'], ['amb', 'Ambience'], ['music', 'Music'], ['title', 'Title screen']];
  var LINE = 'Hello there! Can you beat me at this one?';
  var timers = [];
  function later(ms, f) { timers.push(setTimeout(function () { try { f(); } catch (e) {} }, ms)); }
  function moodFor(ms, m) { var was = Snd.getMood(); Snd.setMood(m); later(ms, function () { if (Snd.getMood() === m) Snd.setMood(was === m ? 'menu' : was); }); }
  function dests(api) { return { sfx: api.bus('sfx'), amb: api.bus('amb'), ui: api.bus('ui') }; }
  function titleLive(name, o) { if (!window.TitleSfx) return; TitleSfx.unlock(); TitleSfx.begin(); TitleSfx.play(name, 0, o || {}, true); }
  function introScore() {
    var sc = [['lightsUp', 0, {}], ['liftoff', 0.28, {}]];
    for (var j = 0; j < 12; j++) sc.push(['thud', 0.6 + j * 0.17, { v: 0.55 + 0.04 * (j % 5), pan: (j / 6 - 1) * 0.8, top: j > 8 }]);
    return sc.concat([['fanfare', 0.45, { beat: (4.0 - 0.45) / 8 }], ['whoosh', 2.95, {}], ['sparkle', 3.05, {}], ['crowd', 3.85, {}], ['confetti', 4.02, {}]]);
  }
  // ---- the catalogue: every sound, where it comes from, how to play it live and offline ----
  var L = [];
  function add(id, cat, label, sec, live, off, where) { L.push({ id: id, cat: cat, label: label, sec: sec, live: live, off: off === false ? null : (off || live), where: where || '' }); }
  add('click', 'ui', 'Button click', 0.5, function () { Snd.click(); }, null, 'Snd.click: every button (main.js, screens)');
  add('pop', 'ui', 'Pop', 0.6, function () { Snd.pop(); }, null, 'Snd.pop: picking, small rewards');
  add('pickup', 'ui', 'Pick up a cube', 0.6, function () { Snd.pickup(); }, null, 'Snd.pickup: grabbing a cube');
  add('sting.emote', 'ui', 'Emote bubble', 0.6, function () { Snd.sting('emote'); }, null, 'Snd.sting(emote)');
  add('title.hover', 'ui', 'Title button hover', 0.4, function () { if (window.TitleSfx) { TitleSfx.unlock(); TitleSfx.ui('hover'); } }, function (a) { TitleSfx._uiInto(a.ctx, dests(a), 'hover'); }, 'TitleSfx.ui(hover): mouse only');
  add('title.press', 'ui', 'Title button press', 0.4, function () { if (window.TitleSfx) { TitleSfx.unlock(); TitleSfx.ui('press'); } }, function (a) { TitleSfx._uiInto(a.ctx, dests(a), 'press'); }, 'TitleSfx.ui(press)');
  add('diceHit', 'sfx', 'One die hits the table', 0.5, function () { Snd.diceHit(0.9); }, function () { Snd._hit(0.9, 0); }, 'Snd.diceHit: the 3D pour, many at once');
  add('clatter', 'sfx', 'Dice spill (flat mat)', 2, function () { Snd.clatter(); }, null, 'Snd.clatter');
  add('cupRattle', 'sfx', 'Cup shake', 1.2, function () { Snd.cupRattle(); }, null, 'Snd.cupRattle');
  add('thunk', 'sfx', 'Cube lands in a zone', 0.8, function () { Snd.thunk(); }, null, 'Snd.thunk: table.js landings');
  add('boop', 'sfx', '"Not quite" boop', 1, function () { Snd.boop(); }, null, 'Snd.boop: wrong answers');
  add('chime', 'sfx', 'Chime (good move)', 2.5, function () { Snd.chime(); }, null, 'Snd.chime');
  add('whistle', 'sfx', 'Referee whistle', 1.2, function () { Snd.whistle(); }, null, 'Snd.whistle');
  add('slam', 'sfx', 'Challenge slam', 3, function () { Snd.slam(); }, null, 'Snd.slam: game.js challenge');
  add('fanfare', 'sfx', 'Win fanfare', 4, function () { Snd.fanfare(); }, null, 'Snd.fanfare: match / cup wins');
  add('sting.card', 'sfx', 'Card earned sparkle', 2, function () { Snd.sting('card'); }, null, 'Snd.sting(card)');
  add('sting.levelup', 'sfx', 'Level up', 2.5, function () { Snd.sting('levelup'); }, null, 'Snd.sting(levelup)');
  add('sting.vs', 'sfx', 'Versus hit', 2, function () { Snd.sting('vs'); }, null, 'Snd.sting(vs)');
  // the 15 creatures' leitmotifs (and Pip's): entrance, plus "won a shake" and "beaten" for one of them
  var MOTIF_NAMES = { pip: 'Pip', snoozy: 'Snoozy (tuba)', penny: 'Penny (xylophone)', fox: 'Rusty (pizzicato)', owl: 'Ollie (clarinet)', wizard: 'Mondo (celesta)', grub: 'Grub (bassoon)', splosh: 'Splosh (marimba)',
    blaze: 'Blaze (muted horn)', hex: 'Hex (accordion)', zog: 'King Messy (oom-pah)', bleep: 'Bleep (bleeps)', flip: 'Flip (flute)', squiggle: 'Squiggle (wobble)', nugget: 'Nugget (horn + timpani)', chroma: 'Queen Chroma (harp)' };
  Object.keys(MOTIF_NAMES).forEach(function (w) { add('motif.' + w, 'sfx', 'Leitmotif: ' + MOTIF_NAMES[w], 4, function () { Snd.motif(w, 'enter'); }, null, 'Snd.theme(kind) on entrance; Snd.motif(id, how)'); });
  add('motif.fox.win', 'sfx', 'Leitmotif: Rusty won a shake', 3, function () { Snd.motif('fox', 'win'); }, null, 'Snd.motif(id, win): hook in game.js');
  add('motif.fox.beaten', 'sfx', 'Leitmotif: Rusty is beaten (friendly)', 4, function () { Snd.motif('fox', 'beaten'); }, null, 'Snd.motif(id, beaten): hook in game.js');
  // table sounds per cube skin, and where a cube lands
  function withSkin(skin, f) { var c = (typeof S !== 'undefined' && S && S.cos) ? S.cos : null, was = c && c.skin; if (c) c.skin = skin; try { f(); } finally { if (c) c.skin = was; } }
  [['classic', 'plastic'], ['candy', 'candy'], ['lava', 'stone'], ['galaxy', 'glass'], ['gold', 'metal']].forEach(function (p) {
    add('thunk.' + p[1], 'sfx', 'Cube lands, ' + p[0] + ' skin (' + p[1] + ')', 0.8, function () { withSkin(p[0], function () { Snd.thunk(); }); }, null, 'Snd.thunk: S.cos.skin = ' + p[0]);
    add('dice.' + p[1], 'sfx', 'Dice knock, ' + p[0] + ' skin (' + p[1] + ')', 0.8, function () { withSkin(p[0], function () { Snd.diceHit(0.95); }); }, function () { withSkin(p[0], function () { Snd._hit(0.95, 0); Snd._hit(0.7, 0.12); }); }, 'Snd.diceHit: the pour');
  });
  ['required', 'permitted', 'forbidden', 'goal', 'resources'].forEach(function (z) { add('thunk.zone.' + z, 'sfx', 'Cube lands in ' + z, 0.8, function () { Snd.thunk(z); }, null, 'Snd.thunk(zone): hook in three/table.js'); });
  add('slide', 'ui', 'Cube slides on the felt', 0.8, function () { Snd.slide(0.35); }, null, 'Snd.slide(sec): hook in three/table.js drag');
  ['lift', 'place', 'flip'].forEach(function (k) { add('card.' + k, 'ui', 'On-Sets card ' + k, 0.6, function () { Snd.card(k); }, null, 'Snd.card(' + k + '): hook in onsets'); });
  add('crowd.chant', 'crowd', 'Crowd chant (theme head, after a great moment)', 2.6, function () { if (window.CrowdSfx) CrowdSfx.play('chant', true); }, null, 'CrowdSfx.play(chant) / crowdReact(chant): hook');
  add('readout', 'sfx', 'Correct Solution reads out', 3.2, function () { Snd.readout([3, '+', 4, '*', 2], 11); }, null, 'Snd.readout(values, goal): hook in game.js');
  add('fx.boom', 'sfx', 'Firework boom', 2.6, function () { if (window.FxSfx) FxSfx.boom({ size: 0.6 }); }, function (a) { FxSfx._into(a.ctx, a.bus('sfx'), 'boom', { size: 0.6 }); }, 'FxSfx.boom: fireworks.js, replay.js');
  add('fx.launch', 'sfx', 'Firework launch', 1.2, function () { if (window.FxSfx) FxSfx.launch({}); }, function (a) { FxSfx._into(a.ctx, a.bus('sfx'), 'launch', {}); }, 'FxSfx.launch');
  add('fx.swish', 'sfx', 'Replay swish', 0.6, function () { if (window.FxSfx) FxSfx.swish({}); }, function (a) { FxSfx._into(a.ctx, a.bus('sfx'), 'swish', {}); }, 'FxSfx.swish: three/replay.js');
  ['clap', 'ooh', 'gasp', 'cheer', 'aw'].forEach(function (k) { add('crowd.' + k, 'crowd', 'Crowd ' + k + ' (in matches)', 2.6, function () { if (window.CrowdSfx) CrowdSfx.play(k, true); }, null, 'crowdReact(' + k + ') in crowd-sfx.js: game.js crowdSay'); });
  ['ooh', 'aww', 'cheer', 'gasp', 'laugh', 'clap', 'chant'].forEach(function (k) { add('snd.crowd.' + k, 'crowd', 'Crowd ' + k + ' (big crowd)', 2.6, function () { Snd.crowdReact(k); }, null, 'Snd.crowdReact(' + k + '): fallback and older screens'); });
  add('roar', 'crowd', 'Stadium roar (wins)', 7.5, function () { Snd.crowd(); }, null, 'Snd.crowd: half a second after a win fanfare');
  ['pip', 'sloth', 'penguin', 'fox', 'owl', 'wizard', 'grub', 'splosh', 'blaze', 'hex', 'zog', 'bleep', 'flip', 'squiggle', 'nugget', 'chroma'].forEach(function (w) { add('babble.' + w, 'voice', 'Babble voice: ' + (MOTIF_NAMES[w] || MOTIF_NAMES[{ sloth: 'snoozy', penguin: 'penny' }[w]] || w).replace(/ \(.*\)$/, ''), 3, function () { Snd.babble(LINE, w); }, null, 'Snd.babble / Snd.talk: creature lines (Monster League found by the match\'s players)'); });
  add('speech', 'voice', 'Read aloud (device voice)', 0, function () { var v = setg().voice; setg().voice = true; Snd.speak('Hi! I will read the lines out loud.', 'pip'); setg().voice = v; }, false, 'Snd.speak: "Read lines aloud" (speechSynthesis, cannot be measured)');
  add('commentator', 'voice', 'Commentator voice', 0, function () { var v = setg().voice; setg().voice = true; Snd.speak('What a goal! The crowd goes wild!', 'owl'); setg().voice = v; }, false, 'commentary.js -> Snd.speak(owl)');
  add('amb.stadium', 'amb', 'Stadium murmur', 6, function () { Snd.ambience('stadium'); later(8000, function () { Snd.ambience('off'); }); }, function () { Snd.ambience('stadium'); }, 'Snd.ambience(stadium): matches');
  add('amb.room', 'amb', 'Room tone', 6, function () { Snd.ambience('room'); later(8000, function () { Snd.ambience('off'); }); }, function () { Snd.ambience('room'); }, 'Snd.ambience(room)');
  add('amb.rain', 'amb', 'Rain', 6, function () { if (window.WeatherSfx) { WeatherSfx.set('rain'); later(8000, function () { WeatherSfx.set('off'); }); } }, function (a) { WeatherSfx._into(a.ctx, 'rain'); }, 'WeatherSfx: rainy stadium matches');
  add('amb.wind', 'amb', 'Wind', 6, function () { if (window.WeatherSfx) { WeatherSfx.set('wind'); later(8000, function () { WeatherSfx.set('off'); }); } }, function (a) { WeatherSfx._into(a.ctx, 'wind'); }, 'WeatherSfx: windy matches');
  add('amb.title', 'amb', 'Title screen murmur', 6, function () { if (window.TitleSfx) { TitleSfx.unlock(); TitleSfx.ambience(true); later(8000, function () { TitleSfx.ambience(false); }); } }, function (a) { TitleSfx._ambInto(a.ctx, dests(a)); }, 'TitleSfx.ambience');
  // the score (js/music.js): every mood, then each league / venue / late-evening / On-Sets flavour of match music
  function score() { return sndOK() && Snd.score ? Snd.score() : null; }
  function bars(a, m, n) { var t = 0.05; for (var i = 0; i < n; i++) t += a.bar(t, m); }
  var BASEF = { league: 0, venue: 'day', late: false, onsets: false };
  function flav(o) { var x = {}, k; for (k in BASEF) x[k] = BASEF[k]; for (k in o) x[k] = o[k]; return x; }
  function musicItem(id, label, mood, fl, where, tens) {
    add(id, 'music', label, 22, function () {
      var M = score(); if (M) { M.force(fl); M.tension(tens == null ? null : tens); }
      moodFor(20000, mood); later(20000, function () { var M2 = score(); if (M2) { M2.force(null); M2.tension(null); } });
    }, function (a) { var M = score(); if (M) { M.force(fl); M.tension(tens == null ? null : tens); M.reseed(11); } bars(a, mood, 8); if (M) { M.force(null); M.tension(null); } }, where);
  }
  musicItem('music.menu', 'Music: menu (the whole theme)', 'menu', flav({ venue: 'home' }), 'Snd.setMood(menu)');
  musicItem('music.play', 'Music: match, Classic League, stadium by day', 'play', flav({}), 'Snd.setMood(play)');
  musicItem('music.think', 'Music: thinking (building a Solution)', 'think', flav({}), 'Snd.setMood(think): builder.js');
  musicItem('music.challenge', 'Music: challenge', 'challenge', flav({}), 'Snd.setMood(challenge)');
  musicItem('music.win', 'Music: win (theme in full)', 'win', flav({}), 'Snd.setMood(win)');
  musicItem('music.messy', 'Music: Monster League (Messy)', 'play', flav({ league: 1 }), 'match vs opponents 6-10');
  musicItem('music.legend', 'Music: Legend League', 'play', flav({ league: 2 }), 'match vs opponents 11-15');
  musicItem('music.night', 'Music: night stadium', 'play', flav({ venue: 'night' }), 'mat night, or stadium at dusk/night');
  musicItem('music.beach', 'Music: beach', 'play', flav({ venue: 'beach' }), 'mat beach');
  musicItem('music.volcano', 'Music: volcano', 'play', flav({ venue: 'volcano' }), 'mat volcano');
  musicItem('music.room', 'Music: other mats (no drums)', 'play', flav({ venue: 'room' }), 'kitchen table and other mats');
  musicItem('music.late', 'Music: late evening lullaby', 'play', flav({ late: true }), 'device clock after 19:30 or before 6:30');
  musicItem('music.onsets', 'Music: On-Sets (waltz)', 'play', flav({ onsets: true }), 'On-Sets screens');
  musicItem('music.tension', 'Music: match, Resources almost gone', 'play', flav({}), 'play / think with few Resources left', 1);
  ['win', 'loss', 'shakeGood', 'shakeKind', 'challengeRight', 'challengeWrong'].forEach(function (k) {
    add('coda.' + k, 'music', 'Coda: ' + k, k === 'win' ? 7 : k === 'loss' ? 7 : 4, function () { var M = score(); if (M) M.coda(k); }, function () { var M = score(); if (M) { M.force(BASEF); M.coda(k); M.force(null); } },
      { win: 'Snd.setMood(win)', loss: 'after the creature\'s dance when the match is lost', shakeGood: 'end of a shake that went well', shakeKind: 'end of a shake that did not', challengeRight: 'challenge resolved, the kid right', challengeWrong: 'challenge resolved, the kid not right' }[k]);
  });
  add('music.dance', 'music', 'Victory dance', 7, function () { Snd.danceMusic(6000); }, function () { Snd._danceAll(6000); }, 'Snd.danceMusic: creature dances');
  // AUDIO2: the birthday choir (js/birthday-sfx.js, loaded here on first use; the song is rendered once, then played)
  function bday(f) { if (window.BirthdaySfx) { f(); return; } var s = document.createElement('script'); s.src = 'js/birthday-sfx.js'; s.onload = function () { try { f(); } catch (e) {} }; document.head.appendChild(s); }
  add('birthday.song', 'music', 'Birthday song (the creature choir)', 17, function () { bday(function () { BirthdaySfx.prerender().then(function () { var h = BirthdaySfx.song(null, 0.1); later(17000, function () { if (h) h.stop(); }); }); }); },
    function (a) { if (window.BirthdaySfx) BirthdaySfx._into(a.ctx, a.bus('music'), 1.6); }, 'BirthdaySfx.song: the birthday easter egg (tap the T 5 times)');
  add('birthday.hooray', 'music', 'Birthday "Hooray!"', 2, function () { bday(function () { BirthdaySfx.prerender().then(function () { setTimeout(function () { BirthdaySfx.pop('hooray'); }, 600); }); }); }, false, 'BirthdaySfx.pop(hooray)');
  add('title.intro', 'title', 'Title opening (whole)', 7.5, function () { if (!window.TitleSfx) return; TitleSfx.unlock(); TitleSfx.begin(); introScore().forEach(function (e) { TitleSfx.play(e[0], e[1], e[2]); }); }, function (a) { TitleSfx._into(a.ctx, dests(a), introScore()); }, 'three/title.js scheduleIntroSound');
  ['fanfare', 'thud', 'lightsUp', 'whoosh', 'sparkle', 'chime', 'crowd', 'confetti', 'boing', 'pat', 'hi', 'clack', 'twinkle', 'tick', 'liftoff'].forEach(function (n) {
    var o = n === 'fanfare' ? { beat: 0.444 } : { v: 0.8 };
    add('title.' + n, 'title', 'Title: ' + n, n === 'fanfare' ? 6.5 : 3, function () { titleLive(n, o); }, function (a) { TitleSfx._into(a.ctx, dests(a), [[n, 0, o]]); }, 'TitleSfx.play(' + n + ')');
  });

  // ---- worst-case moments ----
  var SCENES = {
    win: { label: 'Match win: fanfare, roar, cheer, fireworks, a creature line, chime', sec: 9, run: function (a) {
      var live = !a;
      function at(t, f) { if (live) later(t * 1000, f); else a.at(t, f); }
      at(0, function () { Snd.fanfare(); if (window.CrowdSfx) CrowdSfx.play('cheer', true); });
      if (live) moodFor(9000, 'win'); else { for (var i = 0; i < 3; i++) a.bar(i * a.BAR + 0.05, 'win'); Snd._sting(); }
      at(0.5, function () { Snd.crowd(); });
      at(1.0, function () { Snd.babble('Oh no! You got me this time!', 'fox'); });
      at(2.0, function () { Snd.chime(); });
      for (var k = 0; k < 6; k++) (function (k) {
        if (live) { if (window.FxSfx) { FxSfx.launch({ delay: 0.6 + 0.55 * k }); FxSfx.boom({ delay: 1.3 + 0.55 * k, size: 0.4 + 0.08 * k }); } }
        else { FxSfx._into(a.ctx, a.bus('sfx'), 'launch', {}, 0.6 + 0.55 * k); FxSfx._into(a.ctx, a.bus('sfx'), 'boom', { size: 0.4 + 0.08 * k }, 1.3 + 0.55 * k); }
      })(k);
      if (live && setg().voice === true) later(1500, function () { Snd.speak('What a finish! A brilliant win!', 'owl'); });
    } },
    challenge: { label: 'Challenge: slam, gasp, tense music', sec: 8, run: function (a) {
      if (!a) { Snd.slam(); moodFor(8000, 'challenge'); if (window.CrowdSfx) CrowdSfx.play('gasp', true); return; }
      Snd.slam(); CrowdSfx.play('gasp', true); for (var i = 0; i < 3; i++) a.bar(i * a.BAR + 0.05, 'challenge');
    } },
    title: { label: 'Title opening with the menu music starting', sec: 9, run: function (a) {
      if (!a) { SCENES.title.live(); return; }
      TitleSfx._into(a.ctx, dests(a), introScore()); for (var i = 1; i < 4; i++) a.bar(i * a.BAR, 'menu');
    }, live: function () { L.filter(function (x) { return x.id === 'title.intro'; })[0].live(); later(5600, function () { Snd.musicOn(); }); } }
  };

  // ---- offline measurement ----
  // Many sounds are a little random (variants, pitch, which dice), so each is rendered `reps` times (default 3) and the
  // loudness figures are averaged as energy; the peak is the highest of the renders.
  function combine(rs) {
    if (rs.length === 1) return rs[0];
    function eAvg(k) { var z = 0; rs.forEach(function (r) { z += Math.pow(10, r[k] / 10); }); return +(10 * Math.log10(z / rs.length)).toFixed(1); }
    function avg(k) { var z = 0; rs.forEach(function (r) { z += r[k] || 0; }); return +(z / rs.length).toFixed(k === 'dc' ? 5 : 1); }
    function mx(k) { var m = -1e9; rs.forEach(function (r) { if (r[k] != null && r[k] > m) m = r[k]; }); return m === -1e9 ? null : m; }
    return { dur: mx('dur'), peakDb: mx('peakDb'), lufs: eAvg('lufs'), mMax: eAvg('mMax'), rmsDb: eAvg('rmsDb'), hf: avg('hf'), centroid: Math.round(avg('centroid')), dc: avg('dc'),
      clickIn: mx('clickIn'), clickOut: mx('clickOut'), clipped: mx('clipped'), spread: +(mx('mMax') - Math.min.apply(null, rs.map(function (r) { return r.mMax; }))).toFixed(1), reps: rs.length };
  }
  function measureOne(item, reps) {
    if (!item.off || !sndOK() || !Snd._measure) return Promise.resolve(null);
    var rs = [], n = reps || (item.cat === 'music' ? 2 : 3), tries = 0;
    function one() {
      tries++;
      return Snd._measure(function (api) { item.off(api); }, item.sec, { defaults: true }).then(function (b) {
        var r = SoundMeter.analyze(b); if (!r.silent) rs.push(r); else rs.silent = true;
        return tries < n ? one() : null;
      });
    }
    return one().then(function () {
      var r = rs.length ? combine(rs) : SoundMeter.analyze({ sampleRate: 48000, channels: [new Float32Array(48000)] });
      r.id = item.id; r.cat = item.cat; r.label = item.label; r.flags = SoundMeter.flags(r); if (rs.silent && rs.length) r.flags.push('silent once'); return r;
    }, function (e) { return { id: item.id, cat: item.cat, label: item.label, err: String(e && e.message || e) }; });
  }
  var results = {};
  function measure(ids, onEach) {
    var todo = L.filter(function (x) { return !ids || ids.indexOf(x.id) >= 0; }), out = [], i = 0;
    return new Promise(function (res) {
      (function next() {
        if (i >= todo.length) { res(out); return; }
        var it = todo[i++];
        // chained with promises, not timers: a hidden tab throttles chained timers to one a minute
        measureOne(it).then(function (r) { if (r) { out.push(r); results[it.id] = r; if (onEach) onEach(r); } Promise.resolve().then(next); });
      })();
    });
  }
  function scene(name) {
    var sc = SCENES[name]; if (!sc) return Promise.resolve(null);
    return Snd._measure(function (api) { sc.run(api); }, sc.sec, { defaults: true }).then(function (b) { var r = SoundMeter.analyze(b); r.id = 'scene.' + name; r.label = sc.label; r.flags = SoundMeter.flags(r); results[r.id] = r; return r; });
  }

  // ---- the report Tata pastes to the developer ----
  var flagged = {};
  function report(extra) {
    var st = setg(), a = sndOK() ? Snd.state() : {}, lines = [];
    lines.push("Tata's Equations - sound report (" + new Date().toISOString().slice(0, 16).replace('T', ' ') + ')');
    Object.keys(flagged).forEach(function (id) {
      var it = L.filter(function (x) { return x.id === id; })[0], r = results[id];
      lines.push('- ' + id + ' (' + (it ? it.label : '') + '): ' + flagged[id] + (r && !r.err ? '  [measured ' + r.mMax + ' LUFS, peak ' + r.peakDb + ' dBFS' + (r.flags.length ? ', ' + r.flags.join(', ') : '') + ']' : ''));
    });
    if (extra) lines.push(extra);
    lines.push('Settings: music ' + st.music + ', effects ' + st.sfx + ', crowd ' + mixv('crowd') + ', voices ' + mixv('voice') + ', ambience ' + mixv('amb') + ', mute ' + !!st.mute + ', read aloud ' + (st.voice === true) + ', play on silent ' + (st.playOnSilent === true));
    lines.push('Audio: ' + a.state + ', ' + a.sampleRate + ' Hz, latency ' + (a.baseLatency != null ? Math.round(a.baseLatency * 1000) + ' ms' : '?') + (a.outputLatency ? ' + ' + Math.round(a.outputLatency * 1000) + ' ms' : '') + ', audio session ' + (a.audioSession || 'n/a') + ', speech voices ' + a.speechVoices + ', peak live voices ' + a.peakVoices);
    lines.push('Device: ' + navigator.userAgent + ' | screen ' + screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x | touch ' + (navigator.maxTouchPoints || 0));
    return lines.join('\n');
  }
  function copy(text, btn) {
    function done(ok) { if (btn) { var t = btn.textContent; btn.textContent = ok ? 'Copied!' : 'Select and copy below'; setTimeout(function () { btn.textContent = t; }, 1800); } }
    var box = root && root.querySelector('.sc-report'); if (box) { box.value = text; box.style.display = 'block'; }
    try { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); }); } catch (e) { fallback(); }
    function fallback() { try { box.select(); done(document.execCommand('copy')); } catch (e) { done(false); } }
  }
  function mixv(k) { var m = setg().mix; return m && typeof m[k] === 'number' ? m[k] : 1; }

  // ---- the screen ----
  var root = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function css() {
    if (document.querySelector('link[data-soundcheck]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/soundcheck.css'; l.setAttribute('data-soundcheck', '1'); document.head.appendChild(l);
  }
  function slider(label, key, max, val) {
    return '<label class="sc-slider"><span>' + label + '</span><input type="range" min="0" max="' + max + '" step="0.05" value="' + val + '" data-sc-vol="' + key + '"><b>' + Math.round(val * 100) + '%</b></label>';
  }
  function cell(r) {
    if (!r) return '<span class="sc-m"></span>';
    if (r.err) return '<span class="sc-m sc-bad">' + esc(r.err) + '</span>';
    return '<span class="sc-m' + (r.flags.length ? ' sc-warn' : '') + '" title="peak ' + r.peakDb + ' dBFS, above 4 kHz ' + r.hf + '%">' + r.mMax + ' LUFS' + (r.flags.length ? ' - ' + esc(r.flags.join(', ')) : '') + '</span>';
  }
  function render() {
    var st = setg(), h = [];
    h.push('<div class="sc-panel" role="dialog" aria-label="Sound check"><div class="sc-head"><h2>Sound check</h2><button class="sc-btn" data-sc="close">Done</button></div>');
    h.push('<p class="sc-note">Tap a sound to hear it. If one sounds wrong (too loud, too quiet, harsh, clicks, or silent), tap its flag, then <b>Copy report</b> and paste it to the developer.</p>');
    h.push('<div class="sc-group sc-vols"><h3>Volumes</h3>' + slider('Music', 'music', 1, typeof st.music === 'number' ? st.music : 0.35) + slider('Effects', 'sfx', 1, typeof st.sfx === 'number' ? st.sfx : 0.8) +
      slider('Crowd', 'mix.crowd', 1.5, mixv('crowd')) + slider('Voices', 'mix.voice', 1.5, mixv('voice')) + slider('Ambience', 'mix.amb', 1.5, mixv('amb')) +
      '<p class="sc-small">Crowd, Voices and Ambience are balanced against Effects (100% = as designed).</p>' +
      (('audioSession' in navigator) ? '<label class="sc-toggle"><input type="checkbox" data-sc="silent"' + (st.playOnSilent === true ? ' checked' : '') + '> Play sound even when the iPad is set to silent</label>' : '') + '</div>');
    h.push('<div class="sc-group"><h3>Big moments</h3><div class="sc-row"><button class="sc-btn sc-big" data-sc="loud">Play the loudest moment</button><span class="sc-small">A match win: fanfare, roar, cheer, fireworks, a creature, a chime. Loud, but it should never crackle.</span></div>' +
      '<div class="sc-row"><button class="sc-btn" data-sc="scene" data-arg="challenge">Play a challenge</button><button class="sc-btn" data-sc="scene" data-arg="title">Play the title opening</button><button class="sc-btn" data-sc="stop">Stop</button></div></div>');
    CATS.forEach(function (c) {
      var items = L.filter(function (x) { return x.cat === c[0]; }); if (!items.length) return;
      h.push('<div class="sc-group"><h3>' + c[1] + '</h3>');
      items.forEach(function (it) {
        h.push('<div class="sc-item' + (flagged[it.id] ? ' sc-flagged' : '') + '" data-id="' + it.id + '"><button class="sc-play" data-sc="play" aria-label="Play ' + esc(it.label) + '">&#9654;</button><span class="sc-label">' + esc(it.label) + '<small>' + esc(it.where) + '</small></span>' + cell(results[it.id]) +
          '<button class="sc-flag" data-sc="flag" aria-label="This one sounds wrong">' + (flagged[it.id] ? '&#9873; ' + esc(flagged[it.id]) : '&#9873;') + '</button></div>');
      });
      h.push('</div>');
    });
    h.push('<div class="sc-group"><h3>For the developer</h3><div class="sc-row"><button class="sc-btn" data-sc="measure">Measure every sound (about 30 s, silent)</button><button class="sc-btn" data-sc="copy">Copy report</button></div>' +
      '<div class="sc-scenes">' + ['win', 'challenge', 'title'].map(function (n) { return '<div>' + esc(SCENES[n].label) + ': ' + cell(results['scene.' + n]) + '</div>'; }).join('') + '</div>' +
      '<textarea class="sc-report" readonly></textarea></div></div>');
    root.innerHTML = h.join('');
  }
  var PROBLEMS = ['too loud', 'too quiet', 'harsh / piercing', 'clicks or crackles', 'did not play', 'plays late', 'other'];
  function onClick(e) {
    var b = e.target.closest('[data-sc]'); if (!b || !root.contains(b)) { if (e.target === root) close(); return; }
    var act = b.getAttribute('data-sc'), row = b.closest('.sc-item'), id = row && row.getAttribute('data-id'), it = id && L.filter(function (x) { return x.id === id; })[0];
    try { if (sndOK()) Snd.unlock(); } catch (er) {}
    if (act === 'close') close();
    else if (act === 'play' && it) { try { it.live(); } catch (er) {} b.classList.add('on'); setTimeout(function () { b.classList.remove('on'); }, 400); }
    else if (act === 'flag' && it) {
      var cur = flagged[id], i = cur ? PROBLEMS.indexOf(cur) + 1 : 0;
      if (i >= PROBLEMS.length) delete flagged[id]; else flagged[id] = PROBLEMS[i];
      render();
      if (flagged[id]) copy(report(), null);
    }
    else if (act === 'loud') SCENES.win.run(null);
    else if (act === 'scene') SCENES[b.getAttribute('data-arg')].run(null);
    else if (act === 'stop') stopAll();
    else if (act === 'copy') copy(report(), b);
    else if (act === 'measure') {
      b.disabled = true; var n = 0, tot = L.filter(function (x) { return x.off; }).length;
      measure(null, function () { n++; b.textContent = 'Measuring ' + n + ' / ' + tot + ' ...'; }).then(function () {
        return scene('win').then(function () { return scene('challenge'); }).then(function () { return scene('title'); });
      }).then(function () { render(); }, function () { render(); });
    }
  }
  function onInput(e) {
    var t = e.target;
    if (t.getAttribute('data-sc') === 'silent') { setg().playOnSilent = t.checked; save(); if (sndOK()) Snd.apply(); return; }
    var k = t.getAttribute('data-sc-vol'); if (!k) return;
    var v = Math.max(0, Math.min(1.5, +t.value || 0)), st = setg();
    if (k.indexOf('mix.') === 0) { st.mix = st.mix || {}; st.mix[k.slice(4)] = v; } else st[k] = v;
    var lab = t.parentNode.querySelector('b'); if (lab) lab.textContent = Math.round(v * 100) + '%';
    save(); if (sndOK()) { Snd.apply(); if (k === 'music' && v > 0) Snd.musicOn(); }
  }
  function onChange(e) { var k = e.target.getAttribute('data-sc-vol'); if (!k || !sndOK()) return; if (k === 'mix.crowd') CrowdSfx.play('cheer', true); else if (k === 'mix.voice') Snd.babble(LINE, 'pip'); else if (k === 'sfx') Snd.chime(); else if (k === 'mix.amb') { Snd.ambience('stadium'); later(4000, function () { Snd.ambience('off'); }); } }
  function stopAll() {
    timers.forEach(clearTimeout); timers = [];
    try { Snd.stopSpeak(); Snd.stopBabble(); Snd.stopDance(); Snd.ambience('off'); if (window.WeatherSfx) WeatherSfx.set('off'); if (window.TitleSfx) { TitleSfx.cancel(); TitleSfx.ambience(false); } if (Snd.getMood() !== 'menu') Snd.setMood('menu'); } catch (e) {}
  }
  function open() {
    if (typeof document === 'undefined') return;
    css();
    if (!root) {
      root = document.createElement('div'); root.className = 'sc-back'; root.id = 'soundcheck';
      root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onChange);
      document.body.appendChild(root);
    }
    render(); root.classList.add('on');
  }
  function close() { stopAll(); if (root) root.classList.remove('on'); }
  return { open: open, close: close, list: L, measure: measure, scene: scene, results: results, report: report, SCENES: SCENES };
})();
