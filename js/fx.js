'use strict';
// ======================= VISUAL EFFECTS =======================
var FX = (function () {
  var cv, cx, parts = [], running = false, COLS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#fff'];
  function size() { if (!cv) return; var r = window.devicePixelRatio || 1; cv.width = innerWidth * r; cv.height = innerHeight * r; cx.setTransform(r, 0, 0, r, 0, 0); }
  function loop() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.life > 0; });
    parts.forEach(function (p) {
      p.vy += p.g; p.vx *= p.drag || 1; p.vy *= p.drag || 1; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      cx.save(); cx.globalAlpha = Math.min(1, p.life / 30); cx.translate(p.x, p.y); cx.rotate(p.rot);
      if (p.txt) { cx.font = p.size + 'px serif'; cx.fillText(p.txt, -p.size / 2, p.size / 2); }
      else { cx.fillStyle = p.c; if (p.circle) { cx.beginPath(); cx.arc(0, 0, p.size / 2, 0, 7); cx.fill(); } else cx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      cx.restore();
    });
    if (parts.length) requestAnimationFrame(loop); else { running = false; cx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function go() { if (!running) { running = true; requestAnimationFrame(loop); } }
  function burst(x, y, n, cols) {
    for (var i = 0; i < (n || 40); i++) { var a = Math.random() * 6.283, sp = 2 + Math.random() * 6; parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.1, drag: 0.98, rot: 0, vr: 0, size: 5 + Math.random() * 6, c: pick(cols || COLS), circle: true, life: 55 + Math.random() * 40 }); }
    go();
  }
  return {
    init: function () { cv = document.getElementById('fx'); cx = cv.getContext('2d'); size(); addEventListener('resize', size); },
    confetti: function (n) { for (var i = 0; i < (n || 120); i++) parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 260, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, g: 0.04, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, size: 8 + Math.random() * 9, c: pick(COLS), life: 220 + Math.random() * 80 }); go(); },
    burst: burst,
    fireworks: function () { for (var k = 0; k < 7; k++) setTimeout(function () { burst(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.15 + Math.random() * 0.35), 60); Snd.pop(); }, k * 330); },
    stars: function () { for (var i = 0; i < 45; i++) parts.push({ x: Math.random() * innerWidth, y: -30 - Math.random() * 400, vx: (Math.random() - 0.5), vy: 2 + Math.random() * 2.5, g: 0.02, rot: 0, vr: (Math.random() - 0.5) * 0.1, size: 22 + Math.random() * 18, txt: pick(['⭐', '🌟', '✨']), life: 260 }); go(); }
  };
})();

function victoryFX() { var v = S.cos.victory; if (v === 'fireworks') FX.fireworks(); else if (v === 'stars') FX.stars(); else FX.confetti(160); }
