'use strict';
// ======================= VISUAL EFFECTS =======================
// One small canvas, one loop that only runs while particles exist. API: init, confetti, burst, fireworks, stars.
var FX = (function () {
  var cv, cx, parts = [], running = false, last = 0, MAX = 700,
    COLS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#ffffff'],
    GOLD = ['#fff3b0', '#ffd43b', '#ffa94d', '#ffffff'];
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function size() { if (!cv) return; var r = Math.min(window.devicePixelRatio || 1, 2); cv.width = innerWidth * r; cv.height = innerHeight * r; cx.setTransform(r, 0, 0, r, 0, 0); }
  function add(p) { if (parts.length < MAX) parts.push(p); }
  function star(c, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fill();
  }
  function draw(p) {
    var a = Math.min(1, p.life / (p.fade || 30));
    cx.globalAlpha = a;
    if (p.kind === 'spark') {
      cx.strokeStyle = p.c; cx.lineWidth = p.size; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); cx.stroke(); return;
    }
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.c;
    if (p.kind === 'star') { star(cx, p.size); }
    else if (p.kind === 'circle') { cx.beginPath(); cx.arc(0, 0, p.size / 2, 0, 7); cx.fill(); }
    else if (p.kind === 'ribbon') { cx.scale(1, Math.cos(p.flip)); cx.fillRect(-p.size * 0.9, -p.size * 0.18, p.size * 1.8, p.size * 0.36); }
    else { cx.scale(1, Math.cos(p.flip)); cx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); }
    cx.restore();
  }
  function loop(t) {
    var dt = Math.min(2.2, (t - last) / 16.67 || 1); last = t;
    cx.clearRect(0, 0, innerWidth, innerHeight);
    cx.globalCompositeOperation = 'source-over';
    parts = parts.filter(function (p) { return p.life > 0 && p.y < innerHeight + 60; });
    parts.forEach(function (p) {
      p.vy += p.g * dt; if (p.drag) { var d = Math.pow(p.drag, dt); p.vx *= d; p.vy *= d; }
      if (p.sway) p.x += Math.sin(p.life * 0.09 + p.ph) * p.sway * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.flip += (p.vf || 0) * dt; p.life -= dt;
      if (p.rocket && p.vy > -1.2 && !p.dead) { p.dead = true; p.life = 0; explode(p.x, p.y, p.cols, 70); }
      else if (p.rocket && Math.random() < 0.8) add({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 0.6, vy: 0.5, g: 0.02, drag: 0.96, rot: 0, vr: 0, flip: 0, size: 2.5, c: '#ffe9a8', kind: 'circle', life: 16, fade: 16 });
      draw(p);
    });
    cx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop); else { running = false; cx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function go() { if (!running && cx) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  function burst(x, y, n, cols) {
    n = reduced() ? Math.min(n || 40, 14) : (n || 40);
    cols = cols || COLS;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 2 + Math.random() * 6.5, k = Math.random();
      add({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.12, drag: 0.975, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, flip: Math.random() * 6, vf: 0.1,
        size: k < 0.18 ? 9 + Math.random() * 5 : 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)],
        kind: k < 0.18 ? 'star' : k < 0.4 ? 'spark' : 'circle', life: 50 + Math.random() * 40, fade: 30 });
    }
    go();
  }
  function explode(x, y, cols, n) {
    cols = cols || COLS;
    var c1 = cols[Math.floor(Math.random() * cols.length)];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * 6.283 + Math.random() * 0.15, sp = (i % 2 ? 3 : 5.2) * (0.8 + Math.random() * 0.4);
      add({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.06, drag: 0.965, rot: 0, vr: 0, flip: 0, size: 2.4, c: i % 5 === 0 ? '#fff' : c1, kind: 'spark', life: 55 + Math.random() * 25, fade: 35 });
    }
    for (var j = 0; j < 8; j++) { var b = Math.random() * 6.283; add({ x: x, y: y, vx: Math.cos(b) * 1.5, vy: Math.sin(b) * 1.5, g: 0.03, drag: 0.95, rot: 0, vr: 0, flip: 0, size: 6, c: '#fff6c8', kind: 'circle', life: 14, fade: 14 }); }
    go();
  }
  return {
    init: function () { cv = document.getElementById('fx'); cx = cv.getContext('2d'); size(); addEventListener('resize', size); },
    confetti: function (n) {
      n = reduced() ? 24 : Math.min(n || 120, 260);
      for (var i = 0; i < n; i++) {
        var rib = Math.random() < 0.2;
        add({ x: Math.random() * innerWidth, y: -20 - Math.random() * 320, vx: (Math.random() - 0.5) * 3, vy: 1.6 + Math.random() * 2.4, g: 0.03, drag: 0.999, sway: 0.7, ph: Math.random() * 6,
          rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.18, flip: Math.random() * 6, vf: 0.12 + Math.random() * 0.15, size: rib ? 10 + Math.random() * 8 : 8 + Math.random() * 8,
          c: COLS[Math.floor(Math.random() * COLS.length)], kind: rib ? 'ribbon' : 'rect', life: 240 + Math.random() * 90, fade: 40 });
      }
      go();
    },
    burst: burst,
    fireworks: function () {
      var k = reduced() ? 2 : 7;
      for (var i = 0; i < k; i++) setTimeout(function () {
        var x = innerWidth * (0.15 + Math.random() * 0.7);
        add({ x: x, y: innerHeight + 10, vx: (Math.random() - 0.5) * 1.2, vy: -(9 + Math.random() * 3) * Math.min(1, innerHeight / 700 + 0.3), g: 0.14, drag: 1, rot: 0, vr: 0, flip: 0, size: 3, c: '#fff3b0', kind: 'circle', life: 120, fade: 10, rocket: true, cols: [COLS, GOLD, ['#ff595e', '#ffca3a'], ['#4dabf7', '#fff'], ['#8ac926', '#ffee99']][Math.floor(Math.random() * 5)] });
        go(); Snd.pop();
      }, i * 380);
    },
    stars: function () {
      var n = reduced() ? 12 : 48;
      for (var i = 0; i < n; i++) add({ x: Math.random() * innerWidth, y: -30 - Math.random() * 420, vx: (Math.random() - 0.5), vy: 1.8 + Math.random() * 2.2, g: 0.015, drag: 1, sway: 0.5, ph: Math.random() * 6, rot: Math.random() * 1, vr: (Math.random() - 0.5) * 0.06, flip: 0,
        size: 9 + Math.random() * 12, c: GOLD[Math.floor(Math.random() * 3)], kind: 'star', life: 280, fade: 40 });
      go();
    }
  };
})();

function victoryFX() { var v = S.cos.victory; if (v === 'fireworks') FX.fireworks(); else if (v === 'stars') FX.stars(); else FX.confetti(160); }
