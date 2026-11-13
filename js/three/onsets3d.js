// ON-SETS on the 3D table (an ES module next to js/three/table.js; loaded by js/onsets/game.js).
// What it adds to the shared 3D world, through the small ONSETS hooks in table.js and T3.ctx:
//   - the On-Sets cube kinds (T3.cubeKind): digit cubes 1 1 2 3 4 5, colour cubes (a glossy bead in a dish), operation
//     cubes ∪ ∩ − ′ and the white V / Λ cubes. Drawn like the Equations cubes (inset symbols with a shaded lip + a bump
//     layer), the symbols as bold vector shapes with a tiny hint word (∪ or, ∩ and, − minus, ′ not, V all, Λ none).
//     All faces live in ONE atlas canvas; each kind is a view of it (a texture clone with its own offset).
//   - the Universe: up to 16 real cards (card stock, a printed border, glossy dots, a designed back, a soft contact
//     shadow, a little thickness) lying face up in a neat grid in the table's 'universe' zone. Three instanced meshes
//     (bodies, faces + backs from one 4 x 5 atlas, a soft glow under lifted cards) + the contact shadows: four draw calls.
//   - the DEAL: a small deck slides in from the dealer's side, then the cards leave it one by one, turn over and land in
//     the grid (calm, quick, a tap skips it). T3.onsets.tidy(done) is the reverse (cards back to the deck, which goes).
//   - the teaching motion: the cards of a set LIFT (one smooth ease, tilted a little toward the seat camera) with a
//     coloured rim and a glow, the others dim gently, and a patch above them names the set and counts ("R ∪ B  7 cards").
//     Nothing loops: every change is one ease to a new resting pose, and the render loop goes back to idle when done.
//   - the forming replay: a short sequence of those lifts, step by step (R rises, then ∪ B joins...), ending with the
//     count next to the Goal and one soft burst. A tap skips it.
//   - the Goal label: a sewn patch on the felt under the Goal cubes ("2 × 3 = 6").
// API: T3.onsets = { ready, enter(), exit(), clear(), deal(universe, side, done), tidy(done), highlight(mask | null, label),
//                    form(steps, {final, ok}, done) -> bool, forming(), goal(text | null), skip() }
// Colour-blind hooks (another helper's js/a11y.js): A11y.dotShape(colour), A11y.cubeMark(colour) and
// A11y.drawFacePattern(ctx, colour, size) are used when they exist (colour = 'blue' | 'red' | 'green' | 'yellow').
import * as THREE from 'three';

(function boot(tries) {
  var T3 = window.T3;
  if (!T3) return;
  if (!T3.ctx || !T3.ctx.scene || !T3.cubeKind) { if (tries < 80) setTimeout(function () { boot(tries + 1); }, 100); return; }
  install(T3, T3.ctx);
})(0);

function install(T3, ctx) {
  var HEX = { B: '#1c7ed6', R: '#e03131', G: '#2f9e44', Y: '#f5b400' }, LIGHT = { B: '#8fd0ff', R: '#ff9d9d', G: '#a5efb2', Y: '#fff0a8' };
  var DARK = { B: '#0e4a86', R: '#9a1c1c', G: '#17622a', Y: '#a87000' };
  var NAME = { B: 'blue', R: 'red', G: 'green', Y: 'yellow' }, ORDER = ['B', 'R', 'G', 'Y'];
  var SHOW = { U: '∪', I: '∩', '-': '−', "'": '′', V: 'V', N: 'Λ', '=': '=', S: '⊆' };
  var HINT = { U: 'or', I: 'and', '-': 'minus', "'": 'not', V: 'all', N: 'none' }; // what each operation says in plain words (the teaching text uses the same)
  var FONT = '"Trebuchet MS", "Segoe UI Symbol", "Segoe UI", "Arial Unicode MS", sans-serif';
  var KINDS = [
    { name: 'osD', faces: ['1', '1', '2', '3', '4', '5'], look: 'digit' },
    { name: 'osC1', faces: ['B', 'R', 'G', 'Y', 'B', 'R'], look: 'color' },
    { name: 'osC2', faces: ['B', 'R', 'G', 'Y', 'G', 'Y'], look: 'color' },
    { name: 'osO1', faces: ['U', 'I', '-', "'", 'U', 'I'], look: 'op' },
    { name: 'osO2', faces: ['U', 'I', '-', "'", '-', "'"], look: 'op' },
    { name: 'osR', faces: ['V', 'N', '=', 'S', 'V', 'N'], look: 'restr' }
  ];
  function a11y(fn) { try { return typeof A11y !== 'undefined' && A11y && typeof A11y[fn] === 'function' ? A11y[fn] : null; } catch (e) { return null; } }
  function a11ySig() { var k = a11y('key'); try { return k ? String(k()) : ''; } catch (e) { return ''; } }
  function calm() { try { return !!(window.A11y && A11y.calm && A11y.calm()) || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  // the colour-blind cue for an On-Sets colour ('B' | 'R' | 'G' | 'Y'): its shape when "Patterns" is on, its letter when "Patterns + letters" is on
  function a11yDot(c) { try { var on = a11y('patterns'), f = a11y('dotShape'), lt = a11y('letters'); if (!on || !f || !on()) return null; var d = f(c); return d ? { shape: d.shape, letter: lt && lt() ? d.letter : null } : null; } catch (e) { return null; } }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function dotPath(g, cx, cy, r, shape) {
    g.beginPath();
    if (shape === 'square') rr(g, cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72, r * 0.25);
    else if (shape === 'triangle') { g.moveTo(cx, cy - r * 1.05); g.lineTo(cx + r * 1.0, cy + r * 0.8); g.lineTo(cx - r * 1.0, cy + r * 0.8); g.closePath(); }
    else if (shape === 'diamond') { g.moveTo(cx, cy - r * 1.1); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r * 1.1); g.lineTo(cx - r, cy); g.closePath(); }
    else if (shape === 'star') { for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rk = k % 2 ? r * 0.48 : r * 1.08; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rk, cy + Math.sin(a) * rk); } g.closePath(); }
    else g.arc(cx, cy, r, 0, Math.PI * 2);
  }
  // one coloured dot: a glossy bead (a circle, or the colour-blind shape when that setting gives one), same on cards and cubes
  function dot(g, cx, cy, r, c) {
    var cue = a11yDot(c), shape = cue ? cue.shape : null;
    g.save(); dotPath(g, cx, cy, r, shape);
    g.shadowColor = 'rgba(40,30,10,.38)'; g.shadowBlur = r * 0.2; g.shadowOffsetY = r * 0.09; g.fillStyle = HEX[c]; g.fill(); g.shadowColor = 'transparent';
    var gr = g.createRadialGradient(cx - r * 0.34, cy - r * 0.4, r * 0.08, cx, cy, r * 1.12); gr.addColorStop(0, LIGHT[c]); gr.addColorStop(0.5, HEX[c]); gr.addColorStop(1, DARK[c]);
    g.fillStyle = gr; g.fill();
    g.lineWidth = Math.max(1.5, r * 0.07); g.strokeStyle = 'rgba(0,0,0,.28)'; g.stroke();
    g.clip(); // the shine stays inside the bead, whatever its shape
    g.fillStyle = 'rgba(255,255,255,.62)'; g.beginPath(); g.ellipse(cx - r * 0.3, cy - r * 0.44, r * 0.34, r * 0.19, -0.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = r * 0.1; g.beginPath(); g.arc(cx, cy, r * 0.74, 0.25, 1.05); g.stroke();
    g.restore();
    var letter = cue ? cue.letter : null;
    if (letter) { g.font = '900 ' + Math.round(r * 0.95) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = r * 0.16; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(String(letter), cx, cy + r * 0.05); g.fillStyle = '#fff'; g.fillText(String(letter), cx, cy + r * 0.05); }
  }
  // ---------------- the cube faces: one atlas, 6 kinds in a 2 x 3 grid of 3 x 2 face blocks ----------------
  // Bold vector symbols (one stroked path each, width w) so a child never has to read a font: the U is a cup, the n-shape
  // an arch, V and Λ two strong strokes. Text is only for the digits and the rare = and ⊆.
  var GLY = {
    U: { w: 17, cap: 'butt', join: 'round', path: function (g) { g.beginPath(); g.moveTo(40, 38); g.lineTo(40, 62); g.arc(64, 62, 24, Math.PI, 0, true); g.lineTo(88, 38); } },
    I: { w: 17, cap: 'butt', join: 'round', path: function (g) { g.beginPath(); g.moveTo(40, 88); g.lineTo(40, 66); g.arc(64, 66, 24, Math.PI, 0, false); g.lineTo(88, 88); } },
    '-': { w: 18, cap: 'round', join: 'round', path: function (g) { g.beginPath(); g.moveTo(35, 64); g.lineTo(93, 64); } },
    "'": { w: 19, cap: 'round', join: 'round', path: function (g) { g.beginPath(); g.moveTo(75, 33); g.lineTo(58, 91); } },
    V: { w: 17, cap: 'round', join: 'round', path: function (g) { g.beginPath(); g.moveTo(34, 38); g.lineTo(64, 90); g.lineTo(94, 38); } },
    N: { w: 17, cap: 'round', join: 'round', path: function (g) { g.beginPath(); g.moveTo(34, 90); g.lineTo(64, 38); g.lineTo(94, 90); } }
  };
  var lipCv = null;
  // draws symbol s in the 128-unit face space: drop shadow, firm outline, white fill, then a thin shaded lip along the
  // top-left inner edge (pressed in, like the Equations cubes)
  function symPass(g, s, style, extra, dx, dy) {
    var gl = GLY[s], label = SHOW[s] || s;
    g.save(); g.translate(dx, dy);
    if (gl) { gl.path(g); g.lineCap = gl.cap; g.lineJoin = gl.join; g.lineWidth = gl.w + extra; g.strokeStyle = style; g.stroke(); }
    else {
      g.font = '900 ' + (label === '⊆' ? 76 : 84) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (extra) { g.lineWidth = extra; g.strokeStyle = style; g.strokeText(label, 64, 68); } else { g.fillStyle = style; g.fillText(label, 64, 68); }
    }
    g.restore();
  }
  function drawSym(g, s) {
    symPass(g, s, 'rgba(0,0,0,.4)', 8, 1.5, 3.5); symPass(g, s, 'rgba(0,0,0,.38)', 8, 0, 0); symPass(g, s, '#fff', 0, 0, 0);
    try {
      if (!lipCv) { lipCv = document.createElement('canvas'); lipCv.width = lipCv.height = 256; }
      var h = lipCv.getContext('2d'); h.setTransform(1, 0, 0, 1, 0, 0); h.clearRect(0, 0, 256, 256); h.scale(2, 2); h.globalCompositeOperation = 'source-over';
      symPass(h, s, 'rgba(95,105,135,.85)', 0, 0, 0); h.globalCompositeOperation = 'destination-out'; symPass(h, s, '#000', 0, 1.5, 1.8); h.globalCompositeOperation = 'source-over';
      g.drawImage(lipCv, 0, 0, 128, 128);
    } catch (e) {}
  }
  function drawCubeFace(g, look, s) {
    var bg = look === 'digit' ? ['#ffb15c', '#e8590c'] : look === 'op' ? ['#5b6aa0', '#1f2a52'] : look === 'restr' ? ['#c5b3ff', '#6741d9'] : ['#fffdf4', '#e3ddcc'];
    var lg = g.createLinearGradient(0, 0, 128, 128); lg.addColorStop(0, bg[0]); lg.addColorStop(1, bg[1]); g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
    var eg = g.createRadialGradient(54, 50, 40, 64, 64, 98); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, look === 'color' ? 'rgba(80,60,20,.18)' : 'rgba(0,0,0,.28)'); g.fillStyle = eg; g.fillRect(0, 0, 128, 128);
    if (look === 'color') { // a shallow dish pressed into the face, the glossy bead sitting in it
      g.beginPath(); g.arc(64, 66, 46, 0, Math.PI * 2); var dg = g.createLinearGradient(28, 24, 100, 108); dg.addColorStop(0, 'rgba(110,90,50,.34)'); dg.addColorStop(0.55, 'rgba(110,90,50,.05)'); dg.addColorStop(1, 'rgba(255,255,255,.7)');
      g.fillStyle = dg; g.fill(); g.lineWidth = 2.5; g.strokeStyle = 'rgba(110,90,50,.3)'; g.stroke();
      dot(g, 64, 66, 33, s); return;
    }
    var hint = HINT[s];
    g.save(); if (hint) { g.translate(64, 59); g.scale(0.95, 0.95); g.translate(-64, -64); }
    drawSym(g, s); g.restore();
    if (hint) { g.font = '800 17px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(hint, 64.8, 110.8); g.fillStyle = 'rgba(255,255,255,.82)'; g.fillText(hint, 64, 110); }
  }
  // the bump layer (white = high, grey = pressed in): the symbols and the dish sink a little, the bead is a dome
  function drawCubeBump(g, look, s) {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    try { g.filter = 'blur(1.1px)'; } catch (e) {}
    if (look === 'color') {
      g.fillStyle = '#b8b8b8'; g.beginPath(); g.arc(64, 66, 45, 0, Math.PI * 2); g.fill();
      var rg = g.createRadialGradient(64, 62, 4, 64, 66, 34); rg.addColorStop(0, '#fafafa'); rg.addColorStop(1, '#cfcfcf'); g.fillStyle = rg; g.beginPath(); g.arc(64, 66, 33, 0, Math.PI * 2); g.fill();
    } else {
      var shift = HINT[s] ? 1 : 0; g.save(); if (shift) { g.translate(64, 59); g.scale(0.95, 0.95); g.translate(-64, -64); }
      symPass(g, s, '#909090', 4, 0, 0); symPass(g, s, '#606060', 0, 0, 0); g.restore();
    }
    try { g.filter = 'none'; } catch (e) {}
  }
  var cubeAtlas = { res: 0, sig: null, base: null, bump: null };
  function atlasCanvas(res, draw) {
    var cv = document.createElement('canvas'); cv.width = 6 * res; cv.height = 6 * res; var g = cv.getContext('2d');
    KINDS.forEach(function (K, b) {
      var bx = b % 2, by = Math.floor(b / 2);
      K.faces.forEach(function (s, k) {
        g.save(); g.translate((bx * 3 + k % 3) * res, (by * 2 + Math.floor(k / 3)) * res); g.beginPath(); g.rect(0, 0, res, res); g.clip(); g.scale(res / 128, res / 128);
        draw(g, K.look, s); g.restore();
      });
    });
    return cv;
  }
  function cubeBase(res) {
    res = Math.min(res || 256, 384);
    if (cubeAtlas.base && cubeAtlas.res === res) return cubeAtlas.base;
    if (cubeAtlas.base) cubeAtlas.base.dispose();
    var t = new THREE.CanvasTexture(atlasCanvas(res, drawCubeFace)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    cubeAtlas.base = t; cubeAtlas.res = res; cubeAtlas.sig = a11ySig();
    return t;
  }
  function bumpBase() {
    if (cubeAtlas.bump) return cubeAtlas.bump;
    var t = new THREE.CanvasTexture(atlasCanvas(256, drawCubeBump)); t.colorSpace = THREE.NoColorSpace; t.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    return (cubeAtlas.bump = t);
  }
  function view(base, b) { var t = base.clone(); t.repeat.set(0.5, 1 / 3); t.offset.set((b % 2) * 0.5, 1 - (Math.floor(b / 2) + 1) / 3); t.needsUpdate = true; return t; }
  function registerKinds() {
    KINDS.forEach(function (K, b) {
      T3.cubeKind(K.name, { faces: K.faces, tex: function (res) { return view(cubeBase(res), b); }, bump: function () { return view(bumpBase(), b); } });
    });
  }
  registerKinds();
  // ---------------- the cards: art ----------------
  // A card is 256 x 340 in the atlas (a 4 x 5 grid: the 16 faces, then the back in the first cell of the last row).
  var CW = 1.3, CH = 1.72, CT = 0.08, BT = 0.014, MAXC = 16, CELLW = 256, CELLH = 340, AROWS = 5;
  var cardAtlas = null, cardSig = null;
  function drawCardFace(g, card, cw, ch) {
    // real card stock: warm white with a faint linen grain, a fine printed border; the four dots always sit in the same
    // 2 x 2 places (blue top left, red top right, green bottom left, yellow bottom right); a missing colour is a faint empty dish
    var bg = g.createLinearGradient(0, 0, 0, ch); bg.addColorStop(0, '#fffdf7'); bg.addColorStop(1, '#f4efe3'); g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    var Rn = card * 977 + 13; for (var ln = 0; ln < ch; ln += 3) { Rn = (Rn * 9301 + 49297) % 233280; g.fillStyle = 'rgba(120,100,60,' + (0.012 + (Rn / 233280) * 0.022) + ')'; g.fillRect(0, ln, cw, 1); }
    g.lineWidth = 7; g.strokeStyle = '#e4dcc8'; rr(g, 6, 6, cw - 12, ch - 12, 26); g.stroke();
    g.lineWidth = 3.2; g.strokeStyle = '#8f99bd'; rr(g, 17, 17, cw - 34, ch - 34, 17); g.stroke();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(143,153,189,.5)'; rr(g, 23, 23, cw - 46, ch - 46, 12); g.stroke();
    var r = cw * 0.2;
    ORDER.forEach(function (c, k) {
      var x = cw * (k % 2 ? 0.725 : 0.275), y = ch * (k < 2 ? 0.285 : 0.715);
      if (card & (1 << k)) { dot(g, x, y, r, c); return; }
      g.beginPath(); g.arc(x, y, r * 0.98, 0, Math.PI * 2); var dg = g.createLinearGradient(x - r, y - r, x + r, y + r); dg.addColorStop(0, 'rgba(110,100,70,.13)'); dg.addColorStop(1, 'rgba(255,255,255,.55)'); g.fillStyle = dg; g.fill();
      g.lineWidth = 2.2; g.strokeStyle = 'rgba(110,100,70,.2)'; g.stroke();
    });
  }
  function drawCardBack(g, cw, ch) {
    // the back: the same cream edge, a deep indigo field with a fine diamond lattice, a gold line, and in the middle a cream
    // medallion holding the four dots in their 2 x 2 places (the same layout as the faces). Symmetric, so it never looks upside down.
    g.fillStyle = '#f6f0e1'; g.fillRect(0, 0, cw, ch);
    g.lineWidth = 7; g.strokeStyle = '#e4dcc8'; rr(g, 6, 6, cw - 12, ch - 12, 26); g.stroke();
    g.save(); rr(g, 17, 17, cw - 34, ch - 34, 17); g.clip();
    var fg = g.createLinearGradient(0, 0, cw, ch); fg.addColorStop(0, '#3a4fae'); fg.addColorStop(1, '#212e74'); g.fillStyle = fg; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = 'rgba(255,255,255,.11)'; g.lineWidth = 2;
    for (var d = -ch; d < cw + ch; d += 30) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + ch, ch); g.stroke(); g.beginPath(); g.moveTo(d + ch, 0); g.lineTo(d, ch); g.stroke(); }
    g.restore();
    g.lineWidth = 3; g.strokeStyle = '#ffd770'; rr(g, 30, 30, cw - 60, ch - 60, 11); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(255,215,112,.6)'; rr(g, 37, 37, cw - 74, ch - 74, 8); g.stroke();
    var mx = cw / 2, my = ch / 2, mr = cw * 0.31;
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fillStyle = '#fbf6e8'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#ffd770'; g.stroke();
    g.beginPath(); g.arc(mx, my, mr - 9, 0, Math.PI * 2); g.lineWidth = 1.6; g.strokeStyle = 'rgba(33,46,116,.35)'; g.stroke();
    ORDER.forEach(function (c, k) { dot(g, mx + (k % 2 ? 1 : -1) * mr * 0.4, my + (k < 2 ? -1 : 1) * mr * 0.4, mr * 0.31, c); });
  }
  function cardAtlasTex() {
    var sig = a11ySig();
    if (cardAtlas && cardSig === sig) return cardAtlas;
    var cv = document.createElement('canvas'); cv.width = 4 * CELLW; cv.height = AROWS * CELLH; var g = cv.getContext('2d');
    for (var card = 0; card < 17; card++) {
      g.save(); g.translate((card % 4) * CELLW, Math.floor(card / 4) * CELLH); g.beginPath(); g.rect(0, 0, CELLW, CELLH); g.clip();
      if (card < 16) drawCardFace(g, card, CELLW, CELLH); else drawCardBack(g, CELLW, CELLH);
      g.restore();
    }
    if (cardAtlas) cardAtlas.dispose();
    cardAtlas = new THREE.CanvasTexture(cv); cardAtlas.colorSpace = THREE.SRGBColorSpace; cardAtlas.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    cardSig = sig;
    if (faceMat) { faceMat.map = cardAtlas; faceMat.needsUpdate = true; }
    return cardAtlas;
  }
  // ---------------- the cards: meshes (all four instanced: bodies, faces + backs, glow, contact shadows) ----------------
  function roundShape(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  var group = new THREE.Group(); group.visible = false; group.name = 'onsets-cards'; ctx.scene.add(group);
  // the card stock: a rounded slab with a tiny bevel (it catches the light along its edge), turning about its middle
  var bodyGeo = new THREE.ExtrudeGeometry(roundShape(CW - 2 * BT, CH - 2 * BT, 0.11), { depth: CT - 2 * BT, bevelEnabled: true, bevelThickness: BT, bevelSize: BT, bevelOffset: 0, bevelSegments: 2, curveSegments: 5 });
  bodyGeo.translate(0, 0, -(CT / 2 - BT)); bodyGeo.rotateX(-Math.PI / 2);
  // the printed top and the printed back: two planes in one geometry (aBack picks the atlas cell; the back's picture is turned so
  // it reads the right way up once the card has been turned over about its long axis)
  var faceGeo = (function () {
    var w = CW - 0.07, h = CH - 0.07, top = new THREE.ShapeGeometry(roundShape(w, h, 0.1), 5), bot = top.clone(), p = top.attributes.position, n = p.count, i;
    for (i = 0; i < n; i++) { var u = (p.getX(i) + w / 2) / w, v = (p.getY(i) + h / 2) / h; top.attributes.uv.setXY(i, u, v); bot.attributes.uv.setXY(i, 1 - u, 1 - v); }
    top.rotateX(-Math.PI / 2); top.translate(0, CT / 2 + 0.003, 0); bot.rotateX(Math.PI / 2); bot.translate(0, -CT / 2 - 0.003, 0);
    var g = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(function (k) { var A = top.attributes[k], B = bot.attributes[k], arr = new Float32Array(A.array.length + B.array.length); arr.set(A.array); arr.set(B.array, A.array.length); g.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize)); });
    var ia = top.index.array, ib = bot.index.array, idx = new Uint16Array(ia.length + ib.length); idx.set(ia); for (i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + n; g.setIndex(new THREE.BufferAttribute(idx, 1));
    var back = new Float32Array(n * 2); for (i = n; i < n * 2; i++) back[i] = 1; g.setAttribute('aBack', new THREE.BufferAttribute(back, 1));
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 2), 2));
    g.setAttribute('aRim', new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 4), 4));
    return g;
  })();
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.7 }); // (the edge a shade darker than the face, so the thickness reads)
  var faceMat = new THREE.MeshStandardMaterial({ map: null, roughness: 0.5, metalness: 0 });
  faceMat.onBeforeCompile = function (sh) {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;\nattribute float aBack;\nattribute vec4 aRim;\nvarying vec4 vRim;\nvarying vec2 vCuv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvCuv = vMapUv;\n\tvMapUv = vMapUv * vec2(0.25, 0.2) + (aBack > 0.5 ? vec2(0.0, 0.0) : aCell);\n#endif\n\tvRim = aBack > 0.5 ? vec4(0.0) : aRim;');
    // the coloured rim of a lifted card: a thin glowing band just inside the card's edge (adds light, never darkens)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vRim;\nvarying vec2 vCuv;')
      .replace('#include <opaque_fragment>', 'float rimE = min(min(vCuv.x, 1.0 - vCuv.x) * 1.23, min(vCuv.y, 1.0 - vCuv.y) * 1.65);\n\toutgoingLight += vRim.rgb * vRim.a * smoothstep(0.085, 0.03, rimE) * 1.5;\n#include <opaque_fragment>');
  };
  faceMat.customProgramCacheKey = function () { return 'onsets-card-face2'; };
  var haloTex = (function () {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 160; var g = cv.getContext('2d');
    g.shadowColor = '#fff'; g.shadowBlur = 30; g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 9; rr(g, 24, 24, 80, 112, 14); g.stroke(); g.stroke();
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  var haloGeo = new THREE.PlaneGeometry(CW * 1.5, CH * 1.42); haloGeo.rotateX(-Math.PI / 2);
  var haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  // a soft contact shadow under every card (the low quality tier has no shadow map). It darkens what is under it
  // (dst x (1 - src)), so each card's shadow can pale on its own as the card lifts (its instance colour drops).
  var shTex = (function () {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 160; var g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 160);
    try { g.filter = 'blur(9px)'; } catch (e) {}
    g.fillStyle = '#8c8c8c'; rr(g, 24, 24, 80, 112, 12); g.fill();
    try { g.filter = 'none'; } catch (e) {}
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  var shGeo = new THREE.PlaneGeometry(CW * 1.5, CH * 1.42); shGeo.rotateX(-Math.PI / 2);
  // (the alpha channel is left as it was: the canvas must stay opaque where a shadow lies)
  var shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcColorFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  var bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAXC), faces = new THREE.InstancedMesh(faceGeo, faceMat, MAXC), halos = new THREE.InstancedMesh(haloGeo, haloMat, MAXC), shades = new THREE.InstancedMesh(shGeo, shMat, MAXC);
  bodies.castShadow = true; bodies.receiveShadow = true; faces.receiveShadow = true; halos.renderOrder = 2; shades.renderOrder = 1;
  [bodies, faces, halos, shades].forEach(function (m) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); });
  [shades, faces, halos].forEach(function (m) { m.setColorAt(0, new THREE.Color(1, 1, 1)); });
  // ---------------- the labels: a sewn patch above the lifted cards, and one on the felt under the Goal cubes ----------------
  var TINT = { R: '#ff6b6b', B: '#4dabf7', G: '#51cf66', Y: '#ffd43b' }, GOLD = '#ffd43b';
  function patch(g, x, y, w, h, rim, fill) { // a dark patch, a rim in colour, a stitched inner line (like the zone labels)
    rr(g, x, y, w, h, h / 2); g.fillStyle = fill; g.fill(); g.lineWidth = 6; g.strokeStyle = rim; g.stroke();
    g.save(); g.setLineDash([11, 8]); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.5)'; rr(g, x + 11, y + 11, w - 22, h - 22, (h - 22) / 2); g.stroke(); g.restore();
  }
  var labelCv = document.createElement('canvas'); labelCv.width = 1024; labelCv.height = 192;
  var labelTex = new THREE.CanvasTexture(labelCv); labelTex.colorSpace = THREE.SRGBColorSpace;
  var label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  label.renderOrder = 20; label.visible = false; group.add(label);
  var labelK = 0, labelTgt = 0, labelAt = 'uni';
  // "R ∪ B: 7 cards" -> the set's name, then a bright count disc and the word "cards"; any other text goes in a plain patch
  function paintLabel(text, good, tint) {
    var g = labelCv.getContext('2d'); g.clearRect(0, 0, 1024, 192);
    var rim = good ? '#8ce99a' : tint || GOLD, fill = good ? 'rgba(18,84,38,.92)' : 'rgba(12,24,62,.9)', m = /^(.*?):\s*(\d+)\s+(cards?)$/.exec(text), fs = 80, w, nw, ww;
    g.textBaseline = 'middle';
    if (m) {
      do { g.font = '900 ' + fs + 'px ' + FONT; nw = g.measureText(m[1]).width; g.font = '800 ' + Math.round(fs * 0.52) + 'px ' + FONT; ww = g.measureText(m[3]).width; w = nw + 36 + fs * 1.5 + 16 + ww + 84; fs -= 4; } while (w > 1000 && fs > 36);
      fs += 4; var x0 = (1024 - w) / 2; patch(g, x0, 24, w, 144, rim, fill);
      g.textAlign = 'left'; g.font = '900 ' + fs + 'px ' + FONT; g.fillStyle = '#fff'; g.fillText(m[1], x0 + 42, 99);
      var dx = x0 + 42 + nw + 36 + fs * 0.75; g.beginPath(); g.arc(dx, 96, fs * 0.74, 0, Math.PI * 2); g.fillStyle = good ? '#8ce99a' : tint || GOLD; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke();
      g.textAlign = 'center'; g.font = '900 ' + Math.round(fs * 1.02) + 'px ' + FONT; g.fillStyle = '#0c183c'; g.fillText(m[2], dx, 100);
      g.textAlign = 'left'; g.font = '800 ' + Math.round(fs * 0.52) + 'px ' + FONT; g.fillStyle = '#fff'; g.fillText(m[3], dx + fs * 0.74 + 16, 104);
    } else {
      do { g.font = '900 ' + fs + 'px ' + FONT; w = g.measureText(text).width + 100; fs -= 4; } while (w > 1000 && fs > 36);
      fs += 4; patch(g, (1024 - w) / 2, 24, w, 144, rim, fill); g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(text, 512, 99);
    }
    labelTex.needsUpdate = true;
  }
  // the Goal label on the felt: "2 × 3 = 6" with the answer in gold (popped in once, lying flat under the Goal cubes)
  var goalCv = document.createElement('canvas'); goalCv.width = 768; goalCv.height = 168;
  var goalTex = new THREE.CanvasTexture(goalCv); goalTex.colorSpace = THREE.SRGBColorSpace; goalTex.anisotropy = 4;
  var goalMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 168 / 768).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: goalTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  goalMesh.renderOrder = 3; goalMesh.visible = false; group.add(goalMesh);
  var goalK = 0, goalTgt = 0, goalW = 1;
  function paintGoal(text) {
    var g = goalCv.getContext('2d'); g.clearRect(0, 0, 768, 168); g.textBaseline = 'middle';
    var at = text.lastIndexOf('='), left = at > 0 ? text.slice(0, at).trim() : '', right = at >= 0 ? text.slice(at).trim() : text, fs = 84, lw, rw, w;
    do { g.font = '900 ' + fs + 'px ' + FONT; lw = left ? g.measureText(left).width + 26 : 0; rw = g.measureText(right).width; w = lw + rw + 100; fs -= 4; } while (w > 740 && fs > 36);
    fs += 4; patch(g, (768 - w) / 2, 12, w, 144, '#e0b04a', 'rgba(36,26,12,.92)'); var x = (768 - w) / 2 + 50;
    g.textAlign = 'left'; g.font = '900 ' + fs + 'px ' + FONT; g.fillStyle = '#fff'; if (left) g.fillText(left, x, 88); g.fillStyle = GOLD; g.fillText(right, x + lw, 88);
    goalTex.needsUpdate = true; goalW = w / 768;
  }
  // ---------------- the V / Λ tray: the Goal-setter's three white cubes get a little felt plate of their own ----------------
  // (the slot maths below is the table's own gridSlots for 18 cubes: the plate sits at the right end of the last row of Resources)
  function restrSlots() {
    var r = zoneRect('resources'); if (!r) return [];
    var a = { x: r[0] + 0.25, z: r[1] + 1.05, w: r[2] - 0.5, d: r[3] - 1.25 }, s = 1.25, cols, rows;
    while (s > 0.45) { cols = Math.max(1, Math.floor(a.w / s)); rows = Math.max(1, Math.floor(a.d / s)); if (cols * rows >= 18) break; s -= 0.05; }
    cols = Math.max(1, Math.floor(a.w / s)); rows = Math.ceil(18 / cols); var off = (a.w - cols * s) / 2, out = [];
    for (var k = 0; k < 3; k++) out.push({ x: a.x + off + s / 2 + (cols - 3 + k) * s, z: a.z + s / 2 + (rows - 1) * s, scale: Math.min(1, s / 1.25) });
    return out;
  }
  var trayCv = document.createElement('canvas'); trayCv.width = 768; trayCv.height = 416;
  var trayTex = new THREE.CanvasTexture(trayCv); trayTex.colorSpace = THREE.SRGBColorSpace; trayTex.anisotropy = 4;
  var trayMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: trayTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  trayMesh.renderOrder = 1; trayMesh.visible = false; group.add(trayMesh);
  var trayK = 0, trayTgt = 0, trayCap = null;
  function paintTray(cap) {
    var g = trayCv.getContext('2d'); g.clearRect(0, 0, 768, 416);
    var h = cap ? 400 : 280, y0 = cap ? 8 : 68; rr(g, 8, y0, 752, h, 54); g.fillStyle = 'rgba(96,60,184,.30)'; g.fill();
    g.save(); g.setLineDash([22, 14]); g.lineWidth = 6; g.strokeStyle = 'rgba(214,196,255,.85)'; rr(g, 22, y0 + 14, 724, h - 28, 42); g.stroke(); g.restore();
    if (cap) { g.font = '800 44px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText('V = every card  ·  Λ = no card', 384, 338); }
    trayTex.needsUpdate = true; trayCap = cap;
  }
  function placeTray() {
    trayMesh.visible = trayK > 0.01; if (!trayMesh.visible) return;
    var sl = restrSlots(); if (sl.length < 3) { trayMesh.visible = false; return; }
    var cap = ctx.layoutName !== 'tall'; if (cap !== trayCap) paintTray(cap);
    var w = 3 * 1.25 + 0.55, sc = 0.9 + 0.1 * trayK;
    trayMesh.scale.set(w * sc, 1, (cap ? 2.4 : 1.55 * 416 / 280 * 0.9) * sc); trayMesh.material.opacity = trayK;
    trayMesh.position.set(sl[1].x, 0.028, sl[1].z + (cap ? 0.38 : 0));
  }
  // ---------------- state, layout and the pose of every card ----------------
  var st = { on: false, uni: [], base: [], s: 1, lift: [], liftT: [], dim: [], dimT: [], deal: null, layKey: '', lastNow: 0, form: null, side: 'near', tint: new THREE.Color(GOLD) };
  var M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, 'YXZ'), C = new THREE.Color();
  var DS = 0.5; // the deck's card scale (a small deck, tucked in the corner of the Universe's label strip)
  function zoneRect(z) { var L = ctx.layout; return L && L.z && L.z[z] ? L.z[z] : null; }
  function smooth(k) { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); }
  function layout() {
    var r = zoneRect('universe'), n = st.uni.length; st.base = [];
    if (!r || !n) return;
    var ax = r[0] + 0.3, az = r[1] + 1.05, aw = r[2] - 0.6, ad = r[3] - 1.25, best = null;
    for (var c = 1; c <= n; c++) {
      var rows = Math.ceil(n / c), s = Math.min(1.5, aw / (c * CW * 1.12), ad / (rows * CH * 1.08));
      if (!best || s > best.s + 1e-6) best = { c: c, rows: rows, s: s };
    }
    st.s = best.s;
    var gx = CW * 1.12 * best.s, gz = CH * 1.08 * best.s, z0 = az + (ad - best.rows * gz) / 2 + gz / 2;
    for (var i = 0; i < n; i++) {
      var row = Math.floor(i / best.c), inRow = row < best.rows - 1 ? best.c : n - row * best.c, col = i % best.c, xr = ax + (aw - inRow * gx) / 2 + gx / 2;
      st.base.push({ x: xr + col * gx, z: z0 + row * gz });
    }
    st.layKey = ctx.layoutName + ':' + r.join(',');
  }
  function deckSpot() { var r = zoneRect('universe'); return r ? { x: r[0] + r[2] - 0.78, z: r[1] + 0.58 } : { x: 0, z: 0 }; }
  // the deck's cards: the first card dealt is on top; a hand-stacked look (a hair of offset and turn, the same every time)
  function deckPose(i, n) {
    var D = deckSpot(), j = n - 1 - i;
    return { x: D.x + ((i * 37 % 11) - 5) * 0.006, z: D.z + ((i * 53 % 9) - 4) * 0.006, y: CT * DS / 2 + 0.004 + j * (CT * DS + 0.004), yaw: ((i * 29 % 9) - 4) * 0.014 };
  }
  // where the dealer's deck comes from (and goes back to): a spot beyond the table edge on the dealer's side
  function deckFrom(side) {
    var L = ctx.layout, D = deckSpot(), W = L ? L.W : 18, Dp = L ? L.D : 14;
    return side === 'far' ? { x: D.x, z: -Dp / 2 - 1.6 } : side === 'left' ? { x: -W / 2 - 1.6, z: D.z } : side === 'right' ? { x: W / 2 + 1.6, z: D.z } : { x: D.x, z: D.z + 3.4 };
  }
  // a card away from the grid: in the deck (dk 0) or on its way (deal: deck -> grid; tidy: grid -> deck). null = at rest in the grid.
  function away(i, n, now, d) {
    var tidy = d.kind === 'tidy', b = st.base[i], s = st.s, base = CT * s / 2 + 0.004, ord = tidy ? n - 1 - i : i;
    var k = (now - (d.t0 + (tidy ? 0 : d.enter) + ord * d.gap)) / d.dur, dk = tidy ? (k <= 0 ? 1 : 1 - Math.min(1, k)) : Math.max(0, Math.min(1, k));
    if (dk >= 1) return null;
    if (d.calm) return { x: b.x, y: base, z: b.z, sc: Math.max(0.0001, s * smooth(dk)), yaw: 0, flip: 0, sh: 1 }; // calm: no deck, no flight: each card grows in place (or shrinks away)
    var D = deckPose(i, n), D0 = deckSpot(), e = smooth(dk), fly = Math.sin(Math.PI * e);
    // the whole deck glides in before the first card leaves it (deal) and out again after the last is back (tidy)
    var off = tidy ? (d.leaveAt && now > d.leaveAt ? smooth((now - d.leaveAt) / d.leaveDur) : 0) : 1 - smooth((now - d.t0) / d.enter);
    var dx = D.x + off * (d.from.x - D0.x), dz = D.z + off * (d.from.z - D0.z), dy = D.y + off * 1.1, y = dy + (base - dy) * e + fly * 0.8;
    return { x: dx + (b.x - dx) * e, y: y, z: dz + (b.z - dz) * e, sc: DS + (s - DS) * e, yaw: D.yaw * (1 - e) + fly * 0.18 * (i % 2 ? 1 : -1),
      flip: Math.PI * (1 - smooth((dk - 0.1) / 0.62)), sh: dk <= 0 ? (i === n - 1 ? 1 : 0) : 1 - 0.8 * Math.min(1, (y - base) / 1.0) };
  }
  function pose(now) {
    var n = st.uni.length, cells = faceGeo.attributes.aCell, rims = faceGeo.attributes.aRim, d = st.deal, tr = st.tint.r, tg = st.tint.g, tb = st.tint.b;
    var anyLift = false;
    for (var i = 0; i < n; i++) {
      var b = st.base[i]; if (!b) continue;
      var l = st.lift[i], s = st.s, x = b.x, y = CT * s / 2 + 0.004, z = b.z, yaw = 0, flip = 0, shk = 1, sc = s, a = d ? away(i, n, now, d) : null;
      if (a) { x = a.x; y = a.y; z = a.z; sc = a.sc; yaw = a.yaw; flip = a.flip; shk = a.sh; l = 0; }
      if (l > 0.004) anyLift = true;
      P.set(x, y + l * 0.5 * sc, z); E.set(0.24 * l, yaw, flip); Q.setFromEuler(E); SC.set(sc, sc, sc);
      M.compose(P, Q, SC); bodies.setMatrixAt(i, M); faces.setMatrixAt(i, M);
      SC.setScalar(Math.max(0.0001, sc * l)); P.set(x, 0.02, z); Q.identity(); M.compose(P, Q, SC); halos.setMatrixAt(i, M);
      C.setRGB(tr * l, tg * l, tb * l); halos.setColorAt(i, C); rims.setXYZW(i, tr, tg, tb, l);
      // the contact shadow: widens a touch and pales as the card lifts; in the deck only the bottom card casts one
      SC.setScalar(Math.max(0.0001, sc * (1 + 0.12 * l))); P.y = 0.008; M.compose(P, Q, SC); shades.setMatrixAt(i, M);
      var sk = shk * (1 - 0.6 * l); C.setRGB(sk, sk, sk); shades.setColorAt(i, C);
      var dm = st.dim[i]; C.setRGB(1 - 0.32 * dm, 1 - 0.32 * dm, 1 - 0.29 * dm); faces.setColorAt(i, C);
      cells.setXY(i, (st.uni[i] % 4) * 0.25, 1 - (Math.floor(st.uni[i] / 4) + 1) * 0.2);
    }
    halos.visible = anyLift; // (no glow under any card = no draw call for it)
    bodies.count = faces.count = halos.count = shades.count = n;
    bodies.instanceMatrix.needsUpdate = faces.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = shades.instanceMatrix.needsUpdate = true;
    [shades, faces, halos].forEach(function (m) { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    cells.needsUpdate = true; rims.needsUpdate = true;
    label.material.opacity = labelK; label.visible = labelK > 0.01;
    if (label.visible) labelPos();
    placeGoal(); placeTray();
  }
  function labelPos() {
    var r = zoneRect(labelAt === 'goal' ? 'goal' : 'universe'); if (!r) return;
    label.position.set(r[0] + r[2] / 2, labelAt === 'goal' ? 2.7 : 2.3, r[1] + (labelAt === 'goal' ? r[3] * 0.45 : 0.45));
    var w = Math.min(r[2] + 1, 9) * (labelAt === 'goal' ? 1.05 : 1) * (0.93 + 0.07 * labelK); label.scale.set(w, w * 192 / 1024, 1);
  }
  // the Goal label lies on the felt: under the Goal cubes (wide table) or to their right (tall table)
  function placeGoal() {
    goalMesh.visible = goalK > 0.01; if (!goalMesh.visible) return;
    var r = zoneRect('goal'); if (!r) { goalMesh.visible = false; return; }
    var tall = ctx.layoutName === 'tall', Wp = Math.min(4.3, ((tall ? Math.min(3.5, r[2] / 3) : r[2]) - 0.3) / goalW), pw = goalW * Wp, sc = Wp * (0.88 + 0.12 * goalK);
    goalMesh.scale.set(sc, 1, sc); goalMesh.material.opacity = goalK;
    goalMesh.position.set(tall ? r[0] + r[2] - pw / 2 - 0.4 : r[0] + r[2] / 2, 0.035, tall ? r[1] + r[3] / 2 + 0.2 : r[1] + r[3] - 0.7);
  }
  function setUni(uni) {
    st.uni = (uni || []).slice(0, MAXC); var n = st.uni.length;
    st.lift = new Array(n).fill(0); st.liftT = new Array(n).fill(0); st.dim = new Array(n).fill(0); st.dimT = new Array(n).fill(0);
    labelK = 0; labelTgt = 0; labelAt = 'uni'; goalK = 0; goalTgt = 0;
    layout(); group.visible = st.on && n > 0; pose(performance.now());
  }
  ctx.hooks.frame.push(function (now) {
    if (!st.on) { st.lastNow = now; return; }
    var dt = Math.min(0.05, Math.max(0, (now - (st.lastNow || now)) / 1000)); st.lastNow = now;
    var key = ctx.layoutName + ':' + (zoneRect('universe') || []).join(','), moving = key !== st.layKey;
    if (moving) layout();
    var k = 1 - Math.exp(-dt * 7), i;
    for (i = 0; i < st.uni.length; i++) {
      var dl = st.liftT[i] - st.lift[i], dd = st.dimT[i] - st.dim[i];
      if (Math.abs(dl) > 0.002) { st.lift[i] += dl * k; moving = true; } else if (dl) { st.lift[i] = st.liftT[i]; moving = true; }
      if (Math.abs(dd) > 0.002) { st.dim[i] += dd * k; moving = true; } else if (dd) { st.dim[i] = st.dimT[i]; moving = true; }
    }
    var dlb = labelTgt - labelK; if (Math.abs(dlb) > 0.004) { labelK += dlb * (1 - Math.exp(-dt * 9)); moving = true; } else if (dlb) { labelK = labelTgt; moving = true; }
    var dgl = goalTgt - goalK; if (Math.abs(dgl) > 0.004) { goalK += dgl * (1 - Math.exp(-dt * 8)); moving = true; } else if (dgl) { goalK = goalTgt; moving = true; }
    var dtr = trayTgt - trayK; if (Math.abs(dtr) > 0.004) { trayK += dtr * (1 - Math.exp(-dt * 8)); moving = true; } else if (dtr) { trayK = trayTgt; moving = true; }
    if (st.deal) { moving = true; if (now >= st.deal.endAt) finishDeal(now); }
    if (moving) { pose(now); ctx.dirty(); }
  });
  function finishDeal(now) {
    var d = st.deal; if (!d) return; st.deal = null;
    if (d.kind === 'tidy') setUni([]); else pose(now);
    ctx.dirty(); if (d.done) d.done();
  }
  function highlight(mask, text) {
    var on = mask != null, name = text ? String(text).split(':')[0].trim() : '';
    for (var i = 0; i < st.uni.length; i++) { var inSet = on && (mask & (1 << i)) !== 0; st.liftT[i] = inSet ? 1 : 0; st.dimT[i] = on && !inSet ? 1 : 0; }
    var css = TINT[name] || (name === 'V' ? '#c4b0ff' : GOLD); st.tint.set(css);
    if (on && text) { paintLabel(text, false, css); labelAt = 'uni'; labelTgt = 1; labelPos(); } else labelTgt = 0;
    ctx.dirty(); ctx.startLoop();
  }
  // tap anywhere on the picture during a deal, a tidy-up or a replay: skip to its end
  ctx.renderer.domElement.addEventListener('pointerdown', function (ev) { if (!st.form && !st.deal) return; ev.stopImmediatePropagation(); finishForm(); finishDeal(performance.now()); }, true);
  function finishForm() {
    var f = st.form; if (!f) return;
    st.form = null; f.timers.forEach(clearTimeout); highlight(null);
    if (f.done) { var d = f.done; f.done = null; d(); }
  }
  // one soft burst by the Goal when a Solution makes it: two rings opening on the cloth and the brass frame warming once
  function burst() {
    try {
      var r = zoneRect('goal'); if (!r || !T3._craft) return; var x = r[0] + r[2] / 2, z = r[1] + r[3] / 2;
      T3._craft('ring', { x: x, z: z, css: '#8ce99a', size: Math.min(7, r[2] + 1), ms: 950, alpha: 0.6 });
      setTimeout(function () { try { T3._craft('ring', { x: x, z: z, css: '#ffe066', size: 4.4, ms: 800, alpha: 0.5 }); } catch (e) {} }, 170);
      T3._craft('plinth');
    } catch (e) {}
  }
  function snd(kind, a) { try { if (window.Snd && typeof Snd.card === 'function') Snd.card(kind); else if (window.Snd && a && typeof Snd[a] === 'function') Snd[a](); } catch (e) {} }
  // when a card starts and lands, in the sounds the page has (Snd.card when it exists, a soft click otherwise); timers die with a skip
  function dealSounds(d, n) {
    d.timers = [];
    for (var i = 0; i < n; i++) (function (i) {
      var ord = d.kind === 'tidy' ? n - 1 - i : i, t0 = (d.kind === 'tidy' ? 0 : d.enter) + ord * d.gap;
      d.timers.push(setTimeout(function () { if (st.deal === d) snd('flip', null); }, t0 + d.dur * 0.35));
      d.timers.push(setTimeout(function () { if (st.deal === d) snd('place', 'click'); }, t0 + d.dur * 0.92));
    })(i);
  }

  // the colour-blind setting changed (or On-Sets was entered): redraw the cube faces and the cards that depend on it
  function refreshArt() {
    if (cubeAtlas.base && cubeAtlas.sig !== a11ySig()) { cubeAtlas.base.dispose(); cubeAtlas.base = null; registerKinds(); if (T3.retheme) T3.retheme(); }
    faceMat.map = cardAtlasTex(); faceMat.needsUpdate = true;
  }
  try { window.addEventListener('a11ychange', function () { if (st.on) { refreshArt(); pose(performance.now()); ctx.dirty(); } }); } catch (e) {}

  T3.onsets = {
    ready: true,
    enter: function () {
      st.on = true; refreshArt(); setUni([]);
    },
    exit: function () { finishForm(); st.deal = null; st.on = false; trayK = trayTgt = 0; setUni([]); group.visible = false; ctx.dirty(); },
    clear: function () { finishForm(); st.deal = null; trayK = trayTgt = 0; setUni([]); ctx.dirty(); },
    // the dealer's deck slides in from their side of the table ('near' | 'far' | 'left' | 'right'), then the cards leave it one by one
    deal: function (uni, side, done) {
      if (st.deal) finishDeal(performance.now());
      var L = ctx.layout, now = performance.now(), c = calm(), n = Math.min(MAXC, (uni || []).length);
      st.side = side || 'near'; labelTgt = 0;
      if (document.hidden || !L || !n) { setUni(uni); pose(now); ctx.dirty(); if (done) done(); return; }
      var d = st.deal = { kind: 'deal', t0: now, enter: c ? 0 : 520, gap: c ? 70 : 105, dur: c ? 380 : 600, calm: c, from: deckFrom(st.side), done: done };
      d.endAt = now + d.enter + (n - 1) * d.gap + d.dur + 60; dealSounds(d, n);
      setUni(uni); ctx.dirty(); ctx.startLoop();
    },
    // the end of a shake: the cards flip back into the deck, which slides away; then done() (and the table has no cards)
    tidy: function (done) {
      finishForm(); var now = performance.now(), n = st.uni.length;
      if (st.deal) finishDeal(now);
      if (!st.on || !n || document.hidden || !ctx.layout) { setUni([]); ctx.dirty(); if (done) done(); return; }
      var c = calm(); labelTgt = 0; goalTgt = 0; trayTgt = 0;
      for (var i = 0; i < n; i++) { st.lift[i] = st.liftT[i] = st.dim[i] = st.dimT[i] = 0; }
      var d = st.deal = { kind: 'tidy', t0: now, gap: c ? 40 : 55, dur: c ? 320 : 460, calm: c, hold: 120, leaveDur: 380, from: deckFrom(st.side), done: done };
      var allIn = now + (n - 1) * d.gap + d.dur; d.leaveAt = allIn + d.hold; d.endAt = c ? allIn + 60 : d.leaveAt + d.leaveDur; dealSounds(d, n);
      ctx.dirty(); ctx.startLoop();
    },
    highlight: function (mask, text) { if (!st.on || st.form || st.deal) return; highlight(mask, text); },
    // where the three white V / Λ cubes sit (and the plate under them): the caller puts them there through its cube slots
    restrSlots: restrSlots,
    tray: function (on) { if (!st.on) return; trayTgt = on ? 1 : 0; if (on && calm()) trayK = 1; ctx.dirty(); ctx.startLoop(); },
    // the Goal's label on the felt ("2 × 3 = 6"), popped in once; null takes it away
    goal: function (text) {
      if (!st.on) return;
      if (text) { paintGoal(String(text)); goalTgt = 1; if (calm()) goalK = 1; } else goalTgt = 0;
      ctx.dirty(); ctx.startLoop();
    },
    // steps: [{set, count, text}] -> each step lifts its cards (about 1.1 s apart), then opts.final shows by the Goal
    form: function (steps, opts, done) {
      if (!st.on || !steps || !steps.length || document.hidden || !st.uni.length || !ctx.layout || st.deal) return false;
      finishForm();
      var f = st.form = { timers: [], done: done }, gap = 1100, t = 350;
      steps.forEach(function (sp, k) {
        f.timers.push(setTimeout(function () { if (st.form !== f) return; highlight(sp.set, sp.text + ': ' + sp.count + ' card' + (sp.count === 1 ? '' : 's')); snd('lift', 'click'); }, t + k * gap));
      });
      var tEnd = t + steps.length * gap;
      f.timers.push(setTimeout(function () {
        if (st.form !== f) return;
        paintLabel(opts && opts.final ? opts.final : '', !!(opts && opts.ok)); labelAt = 'goal'; labelTgt = 1; labelPos(); ctx.dirty(); ctx.startLoop();
        if (opts && opts.ok) burst();
        try { if (window.Snd) { if (opts && opts.ok && Snd.chime) Snd.chime(); else if (Snd.click) Snd.click(); } } catch (e) {}
      }, tEnd));
      f.timers.push(setTimeout(function () { if (st.form === f) finishForm(); }, tEnd + 1900));
      ctx.startLoop();
      return true;
    },
    forming: function () { return !!st.form; },
    skip: function () { finishForm(); finishDeal(performance.now()); },
    _state: function () { return { on: st.on, n: st.uni.length, s: st.s, lift: st.lift.slice(), dim: st.dim.slice(), base: st.base.slice(), label: labelK, goal: goalK, dealing: !!st.deal, forming: !!st.form, draws: group.children.length }; } // checks / debugging
  };
}
