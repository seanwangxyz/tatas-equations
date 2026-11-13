'use strict';
// ======================= PERFORMANCE OVERLAY (for Tata / the developer) =======================
// Shown with ?perf=1 in the address, or the Parent corner switch (localStorage 'tataEq.perf' = '1'); js/three/quality.js
// loads this file then. A small box in the top-right corner:
//   fps (average over 2 s, and the 1% low over the last 10 s), a frame-time graph (green under 16.7 ms, yellow under
//   33 ms, red above), 3D frames drawn per second (the table idles at ~12 when nothing moves, which is normal),
//   draw calls and triangles per drawn frame, textures / geometries / shader programs in memory, the quality level,
//   canvas pixel size and device pixel ratio, whether glow / shadows / weather particles are on, the JS heap (Chrome),
//   and live audio voices. Buttons: "Run 20-second benchmark", "Copy report", "Hide".
// The benchmark needs the 3D table on screen (start any match): it plays a busy moment four times over 20 s (crowd
// cheer and wave, fireworks, rain, both creatures dancing), keeps the table drawing every frame, and gives a verdict
// with the Settings choice to use. While the overlay is open every drawn frame's draw calls are added up (renderer
// wrapped); "Hide" puts the renderer back.
//   PerfHUD.show() / hide() / report() -> text / bench() -> Promise<result> / snapshot() -> object
var PerfHUD = (function () {
  var box = null, raf = 0, gaps = [], lastT = 0, drawn = 0, drawnRate = 0, calls = 0, tris = 0, frameCalls = 0, frameTris = 0, rateT = 0;
  var wrapped = null, bench = null, lastBench = null, uiT = 0, pts = { n: 0, verts: 0, t: 0 };
  function T3o() { return window.T3 && window.T3.ctx ? window.T3 : null; }
  function rend() { var t = T3o(); return t && t.ctx.renderer; }
  function wrap() {
    var r = rend(); if (!r || wrapped) return;
    var orig = r.render, scene = T3o().ctx.scene;
    r.render = function (sc, cam) {
      var res = orig.call(this, sc, cam);
      try { frameCalls += r.info.render.calls; frameTris += r.info.render.triangles; if (sc === scene) { drawn++; calls = frameCalls; tris = frameTris; frameCalls = 0; frameTris = 0; } } catch (e) {}
      return res;
    };
    wrapped = { r: r, orig: orig };
  }
  function unwrap() { if (wrapped) { wrapped.r.render = wrapped.orig; wrapped = null; } }
  function pct(arr, p) { if (!arr.length) return 0; var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; }
  function fpsStats(arr) {
    if (!arr.length) return { avg: 0, low1: 0, worst: 0 };
    var sum = 0; arr.forEach(function (g) { sum += g; });
    return { avg: Math.round(1000 * arr.length / sum), low1: Math.round(1000 / pct(arr, 0.99)), worst: Math.round(Math.max.apply(null, arr)) };
  }
  function countPoints() { // weather / fireworks particles in the scene (every 2 s)
    var t = T3o(); if (!t) return; var n = 0, v = 0;
    try { t.ctx.scene.traverse(function (o) { if (o.isPoints && o.visible) { n++; v += o.geometry && o.geometry.attributes.position ? (o.geometry.drawRange.count < Infinity ? Math.min(o.geometry.drawRange.count, o.geometry.attributes.position.count) : o.geometry.attributes.position.count) : 0; } }); } catch (e) {}
    pts = { n: n, verts: v, t: performance.now() };
  }
  function snapshot() {
    var r = rend(), t = T3o(), qi = t && t.qualityInfo ? t.qualityInfo() : null, cv = r && r.domElement;
    var recent = gaps.slice(-120), last10 = gaps.slice(-600), f2 = fpsStats(recent), f10 = fpsStats(last10);
    var mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' / ' + Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB' : 'n/a (Safari)';
    var snd = (typeof Snd !== 'undefined' && Snd.state) ? Snd.state() : null;
    return {
      fps: f2.avg, low1: f10.low1, worstMs: f10.worst, drawnPerSec: drawnRate, calls: calls, triangles: tris,
      textures: r ? r.info.memory.textures : 0, geometries: r ? r.info.memory.geometries : 0, programs: r && r.info.programs ? r.info.programs.length : 0,
      quality: qi ? qi.name + (qi.scaled ? ' (scaled)' : '') + ' / ' + qi.mode : '3D off', canvas: cv ? cv.width + 'x' + cv.height : '-', css: cv ? cv.clientWidth + 'x' + cv.clientHeight : '-',
      pixelRatio: r ? +r.getPixelRatio().toFixed(2) : 0, dpr: window.devicePixelRatio || 1, glow: !!(qi && qi.glow), shadows: !!(qi && qi.shadows),
      particles: pts.n ? pts.n + ' sets, ' + pts.verts + ' points' : 'none', heap: mem, audioVoices: snd ? snd.voices : '-', audio: snd ? snd.state : '-',
      tableOn: !!(cv && document.body.contains(cv) && cv.clientWidth > 0), qlog: qi ? qi.log : []
    };
  }
  function graph(cv) {
    var g = cv.getContext('2d'), w = cv.width, h = cv.height, a = gaps.slice(-w);
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, w, h);
    function y(ms) { return h - Math.min(h, ms / 50 * h); }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(0, y(16.7)); g.lineTo(w, y(16.7)); g.moveTo(0, y(33.3)); g.lineTo(w, y(33.3)); g.stroke();
    for (var i = 0; i < a.length; i++) { var ms = a[i]; g.fillStyle = ms <= 17.5 ? '#3ddc84' : ms <= 34 ? '#ffd23f' : '#ff5a5f'; g.fillRect(i, y(ms), 1, h - y(ms)); }
  }
  function draw() {
    if (!box) return;
    var s = snapshot();
    box.querySelector('.ph-t').innerHTML =
      '<b>' + s.fps + '</b> fps &nbsp;1% low <b>' + s.low1 + '</b> &nbsp;worst ' + s.worstMs + ' ms<br>' +
      '3D drawn ' + s.drawnPerSec + '/s &nbsp;calls ' + s.calls + ' &nbsp;tris ' + (s.triangles > 9999 ? Math.round(s.triangles / 1000) + 'k' : s.triangles) + '<br>' +
      'tex ' + s.textures + ' &nbsp;geo ' + s.geometries + ' &nbsp;prog ' + s.programs + '<br>' +
      'quality <b>' + s.quality + '</b><br>canvas ' + s.canvas + ' (x' + s.pixelRatio + ', dpr ' + s.dpr + ')<br>' +
      'glow ' + (s.glow ? 'on' : 'off') + ' &nbsp;shadows ' + (s.shadows ? 'on' : 'off') + '<br>particles ' + s.particles + '<br>heap ' + s.heap + ' &nbsp;audio ' + s.audio + ' (' + s.audioVoices + ' voices)' +
      (bench ? '<br><b>Benchmark: ' + Math.ceil((bench.end - performance.now()) / 1000) + ' s left...</b>' : lastBench ? '<br><b>' + lastBench.verdict + '</b>' : '');
    graph(box.querySelector('canvas'));
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (lastT) { var gp = now - lastT; if (gp < 1000 && !document.hidden) { gaps.push(gp); if (gaps.length > 1200) gaps.splice(0, gaps.length - 1200); if (bench) bench.gaps.push(gp); } }
    lastT = now;
    if (now - rateT >= 1000) { drawnRate = Math.round(drawn * 1000 / (now - rateT)); drawn = 0; rateT = now; }
    if (now - pts.t > 2000) countPoints();
    if (bench) benchStep(now);
    if (now - uiT > 250) { uiT = now; wrap(); draw(); }
  }
  // ---- the benchmark ----
  function busy() {
    var t = T3o(); if (!t) return;
    try { if (typeof crowdReact === 'function') crowdReact('cheer', { wave: true }); else if (t.crowd) t.crowd('cheer', { wave: true }); } catch (e) {}
    try { if (t.fireworks) t.fireworks({ rockets: 7 }); } catch (e) {}
    try { if (t.creatureWith && t.creatureMood) { t.creatureWith(0, function () { t.creatureMood('dance'); }); t.creatureWith(1, function () { t.creatureMood('dance'); }); } } catch (e) {}
  }
  function benchStep(now) {
    var t = T3o(); if (t && t.kick) t.kick();      // draw every frame, as during a pour
    var el = now - bench.t0;
    while (bench.next < 4 && el >= bench.next * 5000) { bench.next++; busy(); }
    if (now >= bench.end) finishBench();
  }
  function verdict(f, qFrom, qTo) {
    var moved = qFrom !== qTo ? ' (Auto moved from ' + qFrom + ' to ' + qTo + ' during the test.)' : '';
    if (f.avg >= 55 && f.low1 >= 40) return 'Very smooth. 3D picture quality: Auto or Pretty.' + moved;
    if (f.avg >= 40 && f.low1 >= 25) return 'Smooth enough. Keep 3D picture quality on Auto.' + moved;
    if (f.avg >= 25) return 'A bit slow in busy moments. If it feels jerky, choose Fast.' + moved;
    return 'Too slow for the busy 3D moments: choose Fast; if still jerky, switch "3D table and dice" off.' + moved;
  }
  function finishBench() {
    var b = bench; bench = null;
    var f = fpsStats(b.gaps), s = snapshot(), q1 = s.quality;
    try { var t = T3o(); if (b.wx && t.setWeather) t.setWeather(b.wx); } catch (e) {}
    lastBench = { avg: f.avg, low1: f.low1, worstMs: f.worst, frames: b.gaps.length, qualityStart: b.q0, qualityEnd: q1, verdict: verdict(f, b.q0, q1), when: new Date().toISOString() };
    // a hidden page (locked iPad, another app, a background tab) gets almost no frames: that is not the device's speed
    if (b.gaps.length < 200) lastBench.verdict = 'Not enough frames were drawn (' + b.gaps.length + ') - was the screen locked or the game hidden? Run it again with the game on screen.';
    if (b.done) b.done(lastBench);
    draw();
  }
  function runBench() {
    return new Promise(function (res) {
      var s = snapshot(), t = T3o();
      if (!t || !s.tableOn) { lastBench = { verdict: 'Start any match first (the 3D table must be on screen), then press Run.' }; draw(); res(lastBench); return; }
      if (bench) { res(null); return; }
      var wx = null;
      try { if (t.weather && t.setWeather) { var w = t.weather(); wx = { time: w.time === 'night' ? 'night' : w.time, sky: w.sky, rainbow: w.rainbow }; t.setWeather({ time: w.time, sky: 'rain' }); } } catch (e) { wx = null; }
      var now = performance.now();
      bench = { t0: now, end: now + 20000, next: 0, gaps: [], q0: s.quality, wx: wx, done: res };
    });
  }
  function report() {
    var s = snapshot(), b = lastBench, lines = ["Tata's Equations - speed report (" + new Date().toISOString().slice(0, 16).replace('T', ' ') + ')'];
    if (b && b.avg != null) lines.push('Benchmark (20 s busy moment): average ' + b.avg + ' fps, 1% low ' + b.low1 + ' fps, worst frame ' + b.worstMs + ' ms, quality ' + b.qualityStart + ' -> ' + b.qualityEnd + '. ' + b.verdict);
    lines.push('Now: ' + s.fps + ' fps (1% low ' + s.low1 + '), 3D drawn ' + s.drawnPerSec + '/s, draw calls ' + s.calls + ', triangles ' + s.triangles + ', textures ' + s.textures + ', geometries ' + s.geometries + ', programs ' + s.programs);
    lines.push('Quality ' + s.quality + ', canvas ' + s.canvas + ' (css ' + s.css + ', pixel ratio ' + s.pixelRatio + ', device ' + s.dpr + '), glow ' + s.glow + ', shadows ' + s.shadows + ', particles ' + s.particles + ', heap ' + s.heap);
    if (s.qlog && s.qlog.length) lines.push('Quality changes: ' + s.qlog.map(function (e) { return e.from + '->' + e.to + ' (' + e.why + ')'; }).join('; '));
    var st = (typeof S !== 'undefined' && S.set) ? S.set : {};
    lines.push('Settings: quality ' + (st.quality || 'auto') + ', weather ' + (st.weather === undefined ? 'auto' : st.weather) + ', 3D ' + (st.three !== false));
    lines.push('Device: ' + navigator.userAgent + ' | screen ' + screen.width + 'x' + screen.height + ' | cores ' + (navigator.hardwareConcurrency || '?') + ' | touch ' + (navigator.maxTouchPoints || 0));
    return lines.join('\n');
  }
  function copy(btn) {
    var text = report(), ta = box.querySelector('textarea'); ta.value = text; ta.style.display = 'block';
    function ok(v) { btn.textContent = v ? 'Copied!' : 'Select the text below'; setTimeout(function () { btn.textContent = 'Copy report'; }, 1800); }
    try { navigator.clipboard.writeText(text).then(function () { ok(true); }, function () { ta.select(); ok(document.execCommand('copy')); }); } catch (e) { ta.select(); ok(false); }
  }
  function show() {
    if (box) { box.style.display = ''; return; }
    box = document.createElement('div'); box.id = 'perfHud';
    box.setAttribute('style', 'position:fixed;top:calc(6px + env(safe-area-inset-top,0px));right:6px;z-index:9999;width:212px;padding:7px 8px;border-radius:10px;background:rgba(10,18,32,.86);color:#fff;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;pointer-events:auto;box-shadow:0 4px 16px rgba(0,0,0,.4)');
    box.innerHTML = '<canvas width="196" height="40" style="display:block;width:196px;height:40px;margin-bottom:4px;border-radius:4px"></canvas><div class="ph-t"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"><button data-ph="bench">Run 20-second benchmark</button><button data-ph="copy">Copy report</button><button data-ph="hide">Hide</button></div>' +
      '<textarea readonly style="display:none;width:100%;height:90px;margin-top:4px;font:10px monospace"></textarea>';
    [].forEach.call(box.querySelectorAll('button'), function (b) { b.setAttribute('style', 'font:inherit;font-weight:700;border:0;border-radius:6px;padding:6px 7px;min-height:32px;background:#2f8cff;color:#fff;cursor:pointer'); });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ph]'); if (!b) return; var a = b.getAttribute('data-ph');
      if (a === 'bench') runBench(); else if (a === 'copy') copy(b); else if (a === 'hide') hide();
    });
    document.body.appendChild(box);
    rateT = performance.now(); raf = requestAnimationFrame(loop);
  }
  function hide() { if (box) { box.remove(); box = null; } cancelAnimationFrame(raf); raf = 0; unwrap(); lastT = 0; }
  return { show: show, hide: hide, report: report, snapshot: snapshot, bench: runBench, last: function () { return lastBench; } };
})();
window.PerfHUD = PerfHUD;
