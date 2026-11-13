// The big screen as a storyteller: a designed scoreboard drawn into a canvas texture, ONLY when something changes
// (T3.setBoard(text) from the game, or the creature's portrait arriving). Nothing on it ever animates by itself.
//
//   top band   : the kid (kit colours, name, score)  ·  SHAKE 2 / 3  ·  the creature (portrait, name, score)
//   main area  : what the game's board(text) says, designed:
//                ''               -> the Goal as real cubes once there is one, else "SHAKE n" / LET'S PLAY!
//                'GOAL\n24'       -> GOAL label, the Goal drawn with the game's own cube faces, "= 24"
//                'NOW!'           -> a big moment graphic (yellow rays)        'IMPOSSIBLE!' -> the same in violet
//                'GOOOAL!'        -> a big gold moment graphic
//                'REPLAY\n...'    -> a REPLAY tag and the Solution so far as cubes (js/three/replay.js)
//                '(5+2)×6−5\n= 37  GOAL!' -> the last Solution as cubes, "= 37" and a GOAL! badge
//                anything else    -> the text, big (the title screen's "HI, NAME!")
//   bottom band: "TATA'S EQUATIONS" ticker (static)
//
// createBigScreen({ w, h (world units), venue: 'stadium'|'night'|'beach'|'volcano', frame (css), aniso, detached })
//   -> { canvas, texture, paint(text), dispose() }
// The colours of the cube faces come from T3.drawCubeFace (table.js), so the cubes on the screen are the cubes on the table.
import * as THREE from 'three';

var PAL = {
  stadium: { bg0: '#0b1a45', bg1: '#040a22', rows: 'rgba(255,255,255,.035)', band: '#0f2a66', band2: '#0a1d4a', text: '#ffd43b', glow: '#ffb000', ink: '#ffffff', soft: '#8fd3ff', edge: '#2b4a9a', foot: '#0a1638' },
  night:   { bg0: '#0b1a45', bg1: '#040a22', rows: 'rgba(255,255,255,.035)', band: '#0f2a66', band2: '#0a1d4a', text: '#ffd43b', glow: '#ffb000', ink: '#ffffff', soft: '#8fd3ff', edge: '#2b4a9a', foot: '#0a1638' },
  beach:   { bg0: '#0d4f6b', bg1: '#06283a', rows: 'rgba(255,255,255,.04)', band: '#11708f', band2: '#0b4c63', text: '#fff3b0', glow: '#ffcf5a', ink: '#ffffff', soft: '#aef3ff', edge: '#7fe0ff', foot: '#073447' },
  volcano: { bg0: '#2a1036', bg1: '#13061c', rows: 'rgba(255,190,120,.04)', band: '#4a1a4f', band2: '#33123a', text: '#ffcf6b', glow: '#ff7a1c', ink: '#ffffff', soft: '#ffb38a', edge: '#ff9a3c', foot: '#1d0a26' }
};
var FONT = '"Lilita One", "Trebuchet MS", "Segoe UI", sans-serif';

function gS() { return typeof window !== 'undefined' && window.S ? window.S : null; }
function gG() { return typeof window !== 'undefined' && window.G ? window.G : null; }
function T3() { return typeof window !== 'undefined' ? window.T3 : null; }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(g, text, weight, size, maxW, min) { for (;;) { g.font = weight + ' ' + size + 'px ' + FONT; if (g.measureText(text).width <= maxW || size <= (min || 12)) return size; size -= 2; } }
function kitCols() {
  var k = (gS() && gS().kit) || {}, ok = function (c, d) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d; };
  return { shirt: ok(k.shirt, '#c9342c'), trim: ok(k.trim, '#2f8f7c') };
}

// --- remember the cubes of the last replay (so the Solution on the screen keeps their real colours) ---
var lastReplay = null;
function watchReplay() {
  var t = T3(); if (!t || !t.replay || t.replay.__bsWrap) return;
  var f = t.replay, w = function (tokens) { try { lastReplay = (tokens || []).map(function (k) { return k && typeof k === 'object' ? Object.assign({}, k) : k; }); } catch (e) { lastReplay = null; } return f.apply(this, arguments); };
  w.__bsWrap = true; t.replay = w;
}

// --- creature portraits (T3.portrait from portraits.js), cached as images ---
var portraits = {};
function portraitImg(kind, pack, onReady) {
  var t = T3(); if (!t || !t.portrait || !kind) return null;
  var key = kind + '|' + pack, p = portraits[key];
  if (p) { if (p.img && p.ok) return p.img; if (onReady && p.wait.indexOf(onReady) < 0) p.wait.push(onReady); return null; }
  p = portraits[key] = { img: null, ok: false, wait: onReady ? [onReady] : [] };
  function load(url) { if (!url) return; var im = new Image(); im.onload = function () { p.img = im; p.ok = true; var w = p.wait; p.wait = []; w.forEach(function (fn) { try { fn(); } catch (e) {} }); }; im.src = url; }
  try { var ready = t.portraitReady && t.portraitReady(kind, pack, 128); if (ready) load(ready); else { var r = t.portrait(kind, pack, 128); if (r && r.then) r.then(load, function () {}); else load(r); } } catch (e) {}
  return null;
}

// the cubes and parentheses of an expression written as text ("(5+2)×6−5"), coloured from the cubes on the table
var INV = null;
function invShow() {
  if (INV) return INV; INV = {};
  var sh = (window.Eq && window.Eq.SHOW) || {}; Object.keys(sh).forEach(function (k) { INV[sh[k]] = k; });
  INV['x'] = '*'; INV['*'] = '*'; INV['-'] = '-'; INV['/'] = '/'; return INV;
}
function tokensFromText(txt) {
  var G = gG(), out = [], pool = G && G.cubes ? G.cubes.slice() : [], inv = invShow();
  if (lastReplay && lastReplay.length) { // the replay's own tokens, when they match the text
    var cubes = lastReplay.map(function (k) { return k && typeof k === 'object' ? (G && G.cubes && G.cubes[k.id] ? { color: G.cubes[k.id].color, s: G.cubes[k.id].s } : (k.color ? { color: k.color, s: k.s } : null)) : null; });
    if (cubes.every(function (c, i) { return c || typeof lastReplay[i] === 'string'; })) {
      lastReplay.forEach(function (k, i) { out.push(typeof k === 'string' ? { paren: k } : cubes[i]); });
      var shown = out.map(function (o) { return o.paren || ((window.Eq && Eq.SHOW[o.s]) || o.s); }).join('').replace(/\s/g, '');
      if (txt.replace(/\s/g, '').indexOf(shown) === 0 || shown.indexOf(txt.replace(/\s/g, '')) === 0) return trimTo(out, txt);
      out = [];
    }
  }
  var chars = Array.from(String(txt).replace(/\s/g, ''));
  chars.forEach(function (ch) {
    if (ch === '(' || ch === ')') { out.push({ paren: ch }); return; }
    var s = inv[ch] || ch, hit = -1;
    for (var i = 0; i < pool.length; i++) if (pool[i] && pool[i].s === s && pool[i].zone !== 'goal') { hit = i; break; }
    if (hit < 0) for (var j = 0; j < pool.length; j++) if (pool[j] && pool[j].s === s) { hit = j; break; }
    if (hit >= 0) { out.push({ color: pool[hit].color, s: s }); pool[hit] = null; } else out.push({ color: null, s: s });
  });
  return out;
}
function trimTo(list, txt) { // a partial replay: only as many tokens as the text shows
  var n = Array.from(String(txt).replace(/\s/g, '')).length, out = [], k = 0;
  for (var i = 0; i < list.length && k < n; i++) { var o = list[i]; out.push(o); k += Array.from(o.paren || ((window.Eq && Eq.SHOW[o.s]) || o.s)).length; }
  return out;
}
function goalTokens() {
  var G = gG(); if (!G || !G.goalTokens || !G.goalTokens.length || !G.cubes) return null;
  return G.goalTokens.map(function (k) { if (typeof k === 'string') return { paren: k }; var c = G.cubes[k.id]; return c ? { color: c.color, s: c.s } : { color: null, s: '?' }; });
}

export function createBigScreen(o) {
  var pal = PAL[o.venue] || PAL.stadium, W = 1024, H = Math.max(256, Math.round(W * o.h / o.w));
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = o.aniso || 4;
  var lastText = '', disposed = false, fontAsked = false;
  watchReplay();

  function background() {
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, pal.bg0); bg.addColorStop(1, pal.bg1); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.1, W / 2, H * 0.55, W * 0.6); vg.addColorStop(0, 'rgba(255,255,255,.07)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.fillStyle = pal.rows; for (var y = 0; y < H; y += 6) g.fillRect(0, y, W, 2); // LED rows
  }
  function frame() { g.strokeStyle = o.frame || pal.edge; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.strokeRect(13, 13, W - 26, H - 26); }

  // ----- the top band: names, scores, shake -----
  function header(hb) {
    var G = gG(), S = gS(); if (o.detached || !G || !G.players || G.players.length < 2) return false;
    var gr = g.createLinearGradient(0, 0, 0, hb); gr.addColorStop(0, pal.band); gr.addColorStop(1, pal.band2); g.fillStyle = gr; g.fillRect(0, 0, W, hb);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, hb - 3, W, 3);
    var ps = G.players, n = Math.min(ps.length, 3), pad = 22, cx = W / 2, kit = kitCols();
    // the centre: shake n / N, as dots too
    var mid = 'SHAKE ' + (G.shake || 1) + ' / ' + (G.shakes || 1);
    g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, mid, '400', Math.round(hb * 0.3), 200, 10); g.fillStyle = pal.soft; g.fillText(mid, cx, hb * 0.38);
    for (var d = 0; d < (G.shakes || 1) && d < 9; d++) { var dx = cx + (d - ((G.shakes || 1) - 1) / 2) * hb * 0.17; g.beginPath(); g.arc(dx, hb * 0.74, hb * 0.045, 0, 6.2832); g.fillStyle = d < (G.shake || 1) ? pal.text : 'rgba(255,255,255,.22)'; g.fill(); }
    var slotW = n === 2 ? (W / 2 - 130) : (W - 260) / 2;
    function cell(p, i, side, x0, wcell) {
      var sc = String(p.score || 0), box = hb * 0.72, by = (hb - box) / 2, right = side > 0;
      var bx = right ? x0 + wcell - box - pad : x0 + pad;   // the score box sits on the outside
      rr(g, bx, by, box, box, box * 0.18); g.fillStyle = 'rgba(0,0,0,.45)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.25)'; g.stroke();
      g.textAlign = 'center'; fit(g, sc, '400', Math.round(box * 0.78), box * 0.9, 10); g.fillStyle = pal.text; g.shadowColor = pal.glow; g.shadowBlur = 14; g.fillText(sc, bx + box / 2, hb / 2 + 2); g.shadowBlur = 0;
      // badge: kit colours for the kid, a portrait (or a coloured disc) for a creature
      var r = hb * 0.3, ax = right ? bx - r - 14 : bx + box + r + 14, ay = hb / 2;
      g.save(); g.beginPath(); g.arc(ax, ay, r, 0, 6.2832); g.clip();
      if (!p.ai) { g.fillStyle = i === 0 ? kit.shirt : '#5c7cfa'; g.fillRect(ax - r, ay - r, 2 * r, 2 * r); if (i === 0) { g.fillStyle = kit.trim; g.fillRect(ax - r, ay - r * 0.2, 2 * r, r * 0.4); } g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '400 ' + Math.round(r * 1.05) + 'px ' + FONT; g.fillText(i === 0 ? String((S && S.jersey) || '7').slice(0, 2) : String(p.name || '?').charAt(0).toUpperCase(), ax, ay + 2); }
      else { g.fillStyle = '#27365f'; g.fillRect(ax - r, ay - r, 2 * r, 2 * r); var im = portraitImg(p.ai.kind, p.ai.pack || 'classic', function () { if (!disposed) paint(lastText, true); }); if (im) g.drawImage(im, ax - r * 1.15, ay - r * 1.1, r * 2.3, r * 2.3); else { g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '400 ' + Math.round(r * 1.05) + 'px ' + FONT; g.fillText(String(p.name || '?').charAt(0).toUpperCase(), ax, ay + 2); } }
      g.restore(); g.beginPath(); g.arc(ax, ay, r, 0, 6.2832); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.7)'; g.stroke();
      // the name
      var nm = String(p.name || '').toUpperCase(), nx = right ? ax - r - 12 : ax + r + 12, room = Math.max(40, (right ? nx - (x0 + 6) : x0 + wcell - 6 - nx));
      g.textAlign = right ? 'right' : 'left'; fit(g, nm, '400', Math.round(hb * 0.34), room, 10); g.fillStyle = pal.ink; g.fillText(nm, nx, hb / 2 + 2);
    }
    if (n === 2) { cell(ps[0], 0, -1, 0, slotW); cell(ps[1], 1, 1, W - slotW, slotW); }
    else { var cw = (W - 230) / 3; [0, 1, 2].forEach(function (i) { var x0 = i === 0 ? 0 : i === 1 ? W - cw : -1; if (x0 >= 0) cell(ps[i], i, i ? 1 : -1, x0, cw); });
      // the third player: a small line under the shake count
      var p3 = ps[2]; g.textAlign = 'center'; fit(g, String(p3.name || '').toUpperCase() + '  ' + (p3.score || 0), '400', Math.round(hb * 0.22), 220, 10); g.fillStyle = pal.ink; g.fillText(String(p3.name || '').toUpperCase() + '  ' + (p3.score || 0), cx, hb * 0.92); }
    return true;
  }
  function footer(fh) {
    g.fillStyle = pal.foot; g.fillRect(0, H - fh, W, fh); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, H - fh, W, 2);
    var t = "★  TATA'S EQUATIONS  ★"; g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, t, '400', Math.round(fh * 0.62), W * 0.6, 10); g.fillStyle = pal.soft; g.fillText(t, W / 2, H - fh / 2 + 1);
  }

  // ----- pieces of the main area -----
  function bigText(lines, y0, y1, color, glow) {
    lines = lines.slice(0, 3); var avail = y1 - y0, size = Math.floor(avail / lines.length / 1.08), mx;
    for (;;) { g.font = '400 ' + size + 'px ' + FONT; mx = 0; lines.forEach(function (l) { mx = Math.max(mx, g.measureText(l).width); }); if (mx < W - 120 || size < 20) break; size -= 4; }
    var lh = size * 1.05, top = (y0 + y1) / 2 - (lines.length - 1) * lh / 2;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    lines.forEach(function (l, i) { g.lineWidth = Math.max(4, size * 0.09); g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(l, W / 2, top + i * lh + size * 0.04); g.shadowColor = glow || pal.glow; g.shadowBlur = 24; g.fillStyle = color || pal.text; g.fillText(l, W / 2, top + i * lh); g.shadowBlur = 0; });
  }
  function rays(cx, cy, r, col, n) { g.save(); g.translate(cx, cy); g.fillStyle = col; for (var i = 0; i < n; i++) { g.rotate(Math.PI * 2 / n); g.beginPath(); g.moveTo(0, 0); g.lineTo(r, -r * 0.09); g.lineTo(r, r * 0.09); g.closePath(); g.fill(); } g.restore(); }
  function moment(label, c1, c2, y0, y1) {
    var cy = (y0 + y1) / 2, rg = g.createRadialGradient(W / 2, cy, 10, W / 2, cy, W * 0.55); rg.addColorStop(0, c2); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, y0, W, y1 - y0);
    g.save(); g.beginPath(); g.rect(0, y0, W, y1 - y0); g.clip(); g.globalAlpha = 0.22; rays(W / 2, cy, W * 0.7, c1, 22); g.globalAlpha = 1;
    // a few still sparkles
    var sp = [[0.12, 0.25], [0.86, 0.3], [0.2, 0.78], [0.8, 0.8], [0.33, 0.12], [0.68, 0.14], [0.06, 0.55], [0.94, 0.6]];
    sp.forEach(function (p, i) { var x = p[0] * W, y = y0 + p[1] * (y1 - y0), s = 6 + (i % 3) * 4; g.fillStyle = i % 2 ? '#ffffff' : c1; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.3, y - s * 0.3); g.lineTo(x + s, y); g.lineTo(x + s * 0.3, y + s * 0.3); g.lineTo(x, y + s); g.lineTo(x - s * 0.3, y + s * 0.3); g.lineTo(x - s, y); g.lineTo(x - s * 0.3, y - s * 0.3); g.closePath(); g.fill(); });
    g.restore();
    bigText([label], y0 + (y1 - y0) * 0.08, y1 - (y1 - y0) * 0.08, '#ffffff', c1);
  }
  // a row of cubes (the game's own faces) and parentheses, centred in [x0, x1] at y; returns the row's right edge
  function cubeRow(list, x0, x1, yc, maxS) {
    var t = T3(), skin = (gS() && gS().cos && gS().cos.skin) || 'classic', gap = 0.14, nC = 0, nP = 0;
    list.forEach(function (k) { if (k.paren) nP++; else nC++; });
    var units = nC * (1 + gap) + nP * 0.5, s = Math.min(maxS, (x1 - x0) / Math.max(1, units)), wRow = units * s, x = x0 + ((x1 - x0) - wRow) / 2;
    list.forEach(function (k) {
      if (k.paren) { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '400 ' + Math.round(s * 1.05) + 'px ' + FONT; g.fillStyle = pal.ink; g.fillText(k.paren, x + s * 0.25, yc + 2); x += s * 0.5; return; }
      var cx = x + s * gap / 2, cy = yc - s / 2;
      g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = s * 0.18; g.shadowOffsetY = s * 0.06; rr(g, cx, cy, s, s, s * 0.16); g.fillStyle = '#000'; g.fill(); g.restore();
      g.save(); rr(g, cx, cy, s, s, s * 0.16); g.clip();
      var drew = false;
      if (k.color && t && t.drawCubeFace && window.Eq && Eq.CUBE_FACES && Eq.CUBE_FACES[k.color]) { try { g.translate(cx, cy); g.scale(s / 128, s / 128); t.drawCubeFace(g, k.color, k.s, skin); drew = true; } catch (e) { drew = false; } }
      g.restore();
      if (!drew) { // a neutral LED cube
        g.save(); rr(g, cx, cy, s, s, s * 0.16); g.fillStyle = '#24365f'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '400 ' + Math.round(s * 0.7) + 'px ' + FONT; g.fillStyle = '#fff'; g.fillText((window.Eq && Eq.SHOW[k.s]) || k.s, cx + s / 2, cy + s / 2 + 2); g.restore();
      }
      g.save(); rr(g, cx, cy, s, s, s * 0.16); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke(); g.restore();
      x += s * (1 + gap);
    });
    return x;
  }
  function label(txt, x, y, size, col, align) { g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.font = '400 ' + size + 'px ' + FONT; g.fillStyle = col || pal.soft; g.fillText(txt, x, y); }
  function badge(txt, cx, cy, size, c1) {
    g.font = '400 ' + size + 'px ' + FONT; var tw = g.measureText(txt).width, bw = tw + size * 0.9, bh = size * 1.25;
    rr(g, cx - bw / 2, cy - bh / 2, bw, bh, bh / 2); g.fillStyle = c1; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.8)'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1b1000'; g.fillText(txt, cx, cy + 2);
  }

  function paint(text, again) {
    if (disposed) return;
    text = text == null ? '' : String(text); lastText = text;
    if (!fontAsked && document.fonts && document.fonts.load) { fontAsked = true; try { if (!document.fonts.check('40px "Lilita One"')) document.fonts.load('40px "Lilita One"').then(function () { if (!disposed) paint(lastText, true); }, function () {}); } catch (e) {} }
    var G = gG();
    background();
    var hb = Math.round(H * 0.25), fh = Math.round(H * 0.11), hasHead = header(hb), y0 = hasHead ? hb + 6 : 18, y1 = H - fh - 6;
    footer(fh);
    var lines = text.split('\n'), up = text.toUpperCase().trim(), mh = y1 - y0, yc = (y0 + y1) / 2;
    if (/^GO{2,}AL!?$/.test(up)) moment('GOOOAL!', '#ffd43b', 'rgba(255,190,40,.35)', y0, y1);
    else if (up === 'NOW!' || up === '⚡ NOW!') moment('NOW!', '#ffe066', 'rgba(255,220,60,.30)', y0, y1);
    else if (up === 'IMPOSSIBLE!') moment('IMPOSSIBLE!', '#d0a0ff', 'rgba(170,90,255,.32)', y0, y1);
    else if (/^REPLAY/.test(up)) {
      label('↻ REPLAY', 40, y0 + mh * 0.18, Math.round(mh * 0.17), pal.soft);
      var part = lines.slice(1).join(''); if (part) cubeRow(tokensFromText(part), 40, W - 40, y0 + mh * 0.62, mh * 0.55);
    } else if (lines.length >= 2 && /GOAL!\s*$/.test(lines[lines.length - 1].toUpperCase())) {
      var m = lines[lines.length - 1].match(/=\s*([^\s]+)/), val = m ? m[1] : '';
      label('THE SOLUTION', 40, y0 + mh * 0.14, Math.round(mh * 0.13), pal.soft);
      var right = cubeRow(tokensFromText(lines[0]), 40, W - 300, y0 + mh * 0.6, mh * 0.5);
      label('= ' + val, Math.min(right + 16, W - 290), y0 + mh * 0.6, Math.round(mh * 0.4), pal.text);
      badge('GOAL!', W - 110, y0 + mh * 0.6, Math.round(mh * 0.2), '#ffd43b');
    } else if (/^GOAL\n/i.test(text) || (text === '' && goalTokens() && G && G.goal)) {
      var toks = goalTokens(), val2 = /^GOAL\n/i.test(text) ? lines.slice(1).join(' ') : (window.Eq && G.goal ? Eq.fmt(G.goal) : '');
      label('THE GOAL', 40, y0 + mh * 0.14, Math.round(mh * 0.13), pal.soft);
      if (toks && toks.length) {
        var r2 = cubeRow(toks, 40, W - 260, y0 + mh * 0.6, mh * 0.52);
        label('= ' + val2, Math.min(r2 + 16, W - 250), y0 + mh * 0.6, Math.round(mh * 0.42), pal.text);
      } else bigText(['GOAL  ' + val2], y0, y1);
    } else if (text === '') {
      if (G && G.players && !o.detached) bigText([G.shake > 1 && G.shake === G.shakes ? 'LAST SHAKE!' : 'SHAKE ' + (G.shake || 1), 'LET’S PLAY!'], y0 + mh * 0.06, y1 - mh * 0.06);
      else bigText(['LET’S PLAY!'], y0 + mh * 0.1, y1 - mh * 0.1);
    } else bigText(lines, y0 + mh * 0.06, y1 - mh * 0.06);
    frame();
    tex.needsUpdate = true;
    if (again) { try { var tt = T3(); if (tt && tt.kick) tt.kick(); } catch (e) {} } // a portrait or the font arrived: one new frame
  }
  paint('');
  return { canvas: cv, texture: tex, paint: paint, text: function () { return lastText; }, dispose: function () { disposed = true; tex.dispose(); } };
}
