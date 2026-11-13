'use strict';
// ======================= A11Y: EASIER ON THE EYES =======================
// Colour helpers for colour-blind players, high-contrast cube colours, larger text, calmer effects.
// Full notes: docs/handoff/a11y.md. Load after js/screens.js (before js/main.js); css/a11y.css loads last.
//
// Settings (S.set, all optional, missing = default):
//   colorHelp: 'off' | 'patterns' | 'letters'   (letters = patterns + a small R / B / G / K in a corner)
//   palette:   'normal' | 'contrast'            (colour-blind-safe cube hues with clearly different lightness)
//   textSize:  'normal' | 'large' | 'xl'        (1, 1.15, 1.3)
//   calm:      true | false                     (Reduce flashing: fewer particles, no white flashes)
// Classes on <html> (never on <body>: applyCosmetics() rewrites body.className):
//   a11y-pat, a11y-let, a11y-hc, a11y-calm, ts-l / ts-xl, plus the CSS token --ts (1 / 1.15 / 1.3)
//
// Hooks for other files (all safe to call when the setting is off: they draw nothing / return defaults):
//   A11y.cubeMark(color)  -> {letter:'R', pattern:'corner'|'stripes'|'dots'|'checker', name:'red'} (null for other colours)
//   A11y.dotShape(c)      -> On-Sets colour 'B'|'R'|'G'|'Y' -> {shape:'circle'|'square'|'triangle'|'diamond', glyph:'●'|'■'|'▲'|'◆', letter, name}
//   A11y.drawFacePattern(ctx, color, size, opts) -> draws the colour's pattern (and letter) into the square (0,0)-(size,size)
//                          of a canvas, under the symbol. color: 'red'|'blue'|'green'|'black' (cubes), 'B'|'R'|'G'|'Y'
//                          (On-Sets, drawn as the dot shape's pattern), 'power'|'big' (bonus dice, with opts.tri: the d20's triangle faces). opts: {skin, ink:'light'|'dark', force, letters, tri}
//   A11y.drawDot(ctx, c, cx, cy, r) -> fills an On-Sets dot as its shape (circle / square / triangle / diamond); uses ctx.fillStyle
//   A11y.faceCols(color)  -> [light, dark, ink] high-contrast cube colours, or null when the palette is normal
//   A11y.zoneStyle(zone)  -> {dash:[...], cap, width, hatch} for zone outlines (null when helpers are off)
//   A11y.textScale()      -> 1 | 1.15 | 1.3 (for canvas text: 3D labels, the big screen)
//   A11y.calm()           -> true when "Reduce flashing" is on: skip white flashes, fewer particles
//   A11y.patterns(), A11y.letters(), A11y.hc(), A11y.key() (a short string for texture cache keys)
//   A11y.apply()          -> re-read S.set and update <html> (call after loading a save)
//   A11y.settingsHTML()   -> the Settings group (js/screens.js renderSettings can place it; until then it is inserted after render)
//   window event 'a11ychange' {detail:{k, key}} after a setting changes (T3.retheme() has already run for the table)
// Also: div / span controls with data-act get tabindex + role=button (Enter / Space press them), cubes get
// aria-labels like "red 7", icon-only buttons get an aria-label from their title, and a long press on a kit colour
// (or anything with data-tip) shows its name.
// Dev only: ?cvd=protan|deutan|tritan|grey simulates a colour-vision type over the whole page (SVG colour matrix).
var A11y = (function () {
  var MARK = {
    red: { letter: 'R', pattern: 'corner', name: 'red' },
    blue: { letter: 'B', pattern: 'stripes', name: 'blue' },
    green: { letter: 'G', pattern: 'dots', name: 'green' },
    black: { letter: 'K', pattern: 'checker', name: 'black' }
  };
  var DOT = {
    B: { shape: 'circle', glyph: '●', letter: 'B', name: 'blue', pattern: 'stripes' },
    R: { shape: 'square', glyph: '■', letter: 'R', name: 'red', pattern: 'corner' },
    G: { shape: 'triangle', glyph: '▲', letter: 'G', name: 'green', pattern: 'dots' },
    Y: { shape: 'diamond', glyph: '◆', letter: 'Y', name: 'yellow', pattern: 'checker' }
  };
  // High-contrast cube colours (after the Okabe-Ito colour-blind-safe set), spread in lightness so they also part in
  // greyscale: black L*~5, blue ~35, red-orange ~58, green ~82 (the light green takes a dark symbol).
  var HC = { red: ['#ff8a3d', '#c44d00', '#fff'], blue: ['#3a66d8', '#0f2a78', '#fff'], green: ['#9af7d4', '#2cc48f', '#06302a'], black: ['#4a4a4a', '#000000', '#fff'] };
  var SCALE = { normal: 1, large: 1.15, xl: 1.3 };

  function set() { return (window.S && S.set) || {}; }
  function help() { var v = set().colorHelp; return v === 'patterns' || v === 'letters' ? v : 'off'; }
  function patterns() { return help() !== 'off'; }
  function letters() { return help() === 'letters'; }
  function hc() { return set().palette === 'contrast'; }
  function textSize() { var v = set().textSize; return SCALE[v] ? v : 'normal'; }
  function textScale() { return SCALE[textSize()]; }
  function calm() { return set().calm === true; }
  function key() { return help().charAt(0) + (hc() ? 'h' : '') + textSize().charAt(0); }
  function faceCols(color) { return hc() && HC[color] ? HC[color] : null; }
  function cubeMark(color) { return MARK[color] || null; }
  function dotShape(c) { return DOT[c] || null; }

  // ---------- canvas drawing ----------
  function patternOf(color, tri) { var m = MARK[color] || DOT[color]; return m ? m.pattern : !tri ? null : color === 'power' ? 'rim2' : color === 'big' ? 'rimdots' : null; }
  // Patterns sit mostly at the edges and are faint where the symbol is, so the big symbol stays the clearest thing.
  function drawFacePattern(g, color, size, opts) {
    opts = opts || {};
    if (!(opts.force || patterns())) return false;
    var p = patternOf(color, opts.tri); if (!p) return false;
    var dark = opts.ink ? opts.ink === 'dark' : (opts.skin === 'candy' || opts.skin === 'gold' || (hc() && color === 'green'));
    var ink = dark ? '0,0,0' : '255,255,255', edge = dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.28)', i, j;
    g.save(); g.scale(size / 128, size / 128);
    if (p === 'corner') {                       // red: a solid corner triangle, top left
      g.beginPath(); g.moveTo(10, 10); g.lineTo(56, 10); g.lineTo(10, 56); g.closePath();
      g.fillStyle = 'rgba(' + ink + ',.85)'; g.fill(); g.lineWidth = 3; g.strokeStyle = edge; g.stroke();
    } else if (p === 'stripes') {               // blue: horizontal stripes (fainter across the middle)
      for (i = 10; i < 120; i += 15) { g.fillStyle = 'rgba(' + ink + ',' + (i > 30 && i < 100 ? 0.13 : 0.3) + ')'; g.fillRect(8, i, 112, 5); }
    } else if (p === 'dots') {                  // green: a grid of dots (fainter across the middle)
      for (i = 0; i < 6; i++) for (j = 0; j < 6; j++) {
        var x = 14 + i * 20, y = 14 + j * 20, mid = i > 0 && i < 5 && j > 0 && j < 5;
        g.beginPath(); g.arc(x, y, mid ? 3.4 : 5.4, 0, 6.283); g.fillStyle = 'rgba(' + ink + ',' + (mid ? 0.18 : 0.58) + ')'; g.fill();
      }
    } else if (p === 'checker') {               // black: a checked edge all round
      for (i = 0; i < 14; i++) for (j = 0; j < 14; j++) {
        if (i > 1 && i < 12 && j > 1 && j < 12) continue;
        if ((i + j) % 2) continue;
        g.fillStyle = 'rgba(' + ink + ',.5)'; g.fillRect(8 + i * 8, 8 + j * 8, 8, 8);
      }
    } else if (p === 'rim2' || p === 'rimdots') { // bonus dice (triangle faces): Power = a double rim, Big-number = a dotted rim
      g.beginPath(); g.moveTo(64, 26); g.lineTo(23, 97); g.lineTo(105, 97); g.closePath();
      g.strokeStyle = 'rgba(' + ink + ',.55)'; g.lineWidth = p === 'rim2' ? 3 : 5; g.lineCap = 'round';
      if (p === 'rimdots') g.setLineDash([0.1, 9]); g.stroke(); g.setLineDash([]);
      if (p === 'rim2') { g.beginPath(); g.moveTo(64, 34); g.lineTo(30, 93); g.lineTo(98, 93); g.closePath(); g.stroke(); }
    }
    var m = MARK[color] || DOT[color];
    if (m && (opts.letters != null ? opts.letters : letters())) {   // the letter, top right
      g.font = '900 25px "Trebuchet MS", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = 6; g.strokeStyle = dark ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.75)'; g.strokeText(m.letter, 108, 21);
      g.fillStyle = dark ? '#1b1b1b' : '#fff'; g.fillText(m.letter, 108, 21);
    }
    g.restore();
    return true;
  }
  function drawDot(g, c, cx, cy, r) {
    var d = DOT[c], s = d ? d.shape : 'circle';
    g.beginPath();
    if (s === 'square') { g.rect(cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72); }
    else if (s === 'triangle') { g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.98, cy + r * 0.78); g.lineTo(cx - r * 0.98, cy + r * 0.78); g.closePath(); }
    else if (s === 'diamond') { g.moveTo(cx, cy - r * 1.05); g.lineTo(cx + r * 1.05, cy); g.lineTo(cx, cy + r * 1.05); g.lineTo(cx - r * 1.05, cy); g.closePath(); }
    else g.arc(cx, cy, r, 0, 6.283);
    g.fill();
  }
  // zone outlines: Required solid, Permitted dashed, Forbidden dotted (+ a faint hatch); line lengths in canvas px
  function zoneStyle(z) {
    if (!patterns()) return null;
    if (z === 'required') return { dash: [], cap: 'butt', width: 7 };
    if (z === 'permitted') return { dash: [26, 14], cap: 'butt', width: 6 };
    if (z === 'forbidden') return { dash: [1, 15], cap: 'round', width: 9, hatch: true };
    return null;
  }
  function drawHatch(g, x, y, w, h, color) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = color || 'rgba(255,168,168,.22)'; g.lineWidth = 5;
    for (var k = -h; k < w; k += 30) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); }
    g.restore();
  }

  // ---------- applying the settings ----------
  var root = document.documentElement;
  function apply() {
    var c = root.classList;
    c.toggle('a11y-pat', patterns()); c.toggle('a11y-let', letters()); c.toggle('a11y-hc', hc()); c.toggle('a11y-calm', calm());
    c.toggle('ts-l', textSize() === 'large'); c.toggle('ts-xl', textSize() === 'xl');
    root.style.setProperty('--ts', String(textScale()));
  }
  // "Reduce flashing": the game's effects already tone down for prefers-reduced-motion (js/fx.js, fireworks, replay,
  // title...). With S.set.calm on, that media query reports a match too, so every one of them follows without changes.
  (function shimMatchMedia() {
    if (!window.matchMedia || window.matchMedia.__a11y) return;
    var mm = window.matchMedia.bind(window);
    var shim = function (q) {
      var r = mm(q);
      if (calm() && /prefers-reduced-motion\s*:\s*reduce/.test(String(q))) {
        return { matches: true, media: r.media, onchange: null, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; } };
      }
      return r;
    };
    shim.__a11y = true; window.matchMedia = shim;
  })();

  // ---------- dev: colour-vision simulation (?cvd=protan|deutan|tritan|grey) ----------
  var CVD = { // Machado, Oliveira & Fernandes 2009, severity 1.0 (linear RGB, SVG's default for filters)
    protan: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
    deutan: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
    tritan: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
    grey: '0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0'
  };
  function cvd(type) {
    var old = document.getElementById('a11yCvd'); if (old) old.parentNode.removeChild(old);
    if (!CVD[type]) { root.style.filter = ''; return false; }
    var d = document.createElement('div'); d.id = 'a11yCvd'; d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    d.innerHTML = '<svg width="0" height="0"><filter id="a11yCvdF" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="' + CVD[type] + '"/></filter></svg>';
    document.body.appendChild(d); root.style.filter = 'url(#a11yCvdF)';
    return true;
  }
  try { var mq = /[?&]cvd=(\w+)/.exec(location.search); if (mq) { if (document.body) cvd(mq[1]); else document.addEventListener('DOMContentLoaded', function () { cvd(mq[1]); }); } } catch (e) {}

  // ---------- Settings ----------
  function seg(k, cur, list) {
    return '<div class="seg" role="radiogroup" style="flex-wrap:wrap">' + list.map(function (q) { return '<button class="' + (cur === q[0] ? 'on' : '') + '" role="radio" aria-checked="' + (cur === q[0]) + '" data-act="a11ySet" data-k="' + k + '" data-arg="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div>';
  }
  function tog(k, on) { return '<button class="btn small ' + (on ? 'green' : '') + '" aria-pressed="' + on + '" data-act="a11ySet" data-k="' + k + '" data-arg="' + (on ? 'off' : 'on') + '">' + (on ? '✔ On' : 'Off') + '</button>'; }
  function preview() {
    return '<span class="a11y-prev" aria-hidden="true">' + ['red', 'blue', 'green', 'black'].map(function (c, i) { return '<span class="cube mini c-' + c + '"><span>' + ['7', '+', '3', '×'][i] + '</span></span>'; }).join('') + '</span>';
  }
  function suggest() {
    var mm = window.matchMedia; var more = false;
    try { more = mm('(prefers-contrast: more)').matches || mm('(forced-colors: active)').matches; } catch (e) {}
    return more ? '<br><b>This device asks for more contrast:</b> High-contrast colours may help.' : '';
  }
  function settingsHTML() {
    return '<div class="group a11y-group"><h3><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg> Easier on the eyes</h3>' +
      '<div class="setrow"><label>Colour helpers<br><small style="font-weight:600">A pattern for each cube colour (red: corner, blue: stripes, green: dots, black: checked edge), and solid / dashed / dotted zone edges. Helps when two colours look alike.' +
      ' Auto-suggest: if a player mixes up red and green (or blue and black) cubes, switch this on.' + suggest() + '</small></label>' +
      seg('colorHelp', help(), [['off', 'Off'], ['patterns', 'Patterns'], ['letters', 'Patterns + letters']]) + preview() + '</div>' +
      '<div class="setrow"><label>High-contrast colours<br><small style="font-weight:600">Cube colours that stay apart for colour-blind eyes and in black and white, plus darker text on light buttons.</small></label>' + tog('palette', hc()) + '</div>' +
      '<div class="setrow"><label>Text size<br><small style="font-weight:600">Pip\'s words, buttons, menus and lessons.</small></label>' +
      seg('textSize', textSize(), [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']]) + '</div>' +
      '<div class="setrow"><label>Reduce flashing<br><small style="font-weight:600">Fewer confetti and fireworks, no white camera flash.</small></label>' + tog('calm', calm()) + '</div></div>';
  }
  function inject() {
    var box = document.getElementById('settings'); if (!box || box.querySelector('.a11y-group')) return;
    var hs = [].slice.call(box.querySelectorAll('.group > h3')), at = hs.filter(function (h) { return /the game/i.test(h.textContent); })[0];
    if (at) at.parentNode.insertAdjacentHTML('beforebegin', settingsHTML());
    else { var p = box.querySelector('.panel'); if (p) p.insertAdjacentHTML('beforeend', settingsHTML()); }
    var jump = box.querySelector('.seg [data-act="setJump"]');
    if (jump && !box.querySelector('[data-act="setJump"][data-arg="Easier"]')) jump.parentNode.insertAdjacentHTML('beforeend', '<button data-act="setJump" data-arg="Easier">Eyes</button>');
  }
  function hookSettings() {
    if (typeof window.renderSettings !== 'function' || window.renderSettings.__a11y) return;
    var f = window.renderSettings;
    window.renderSettings = function () { var r = f.apply(this, arguments); try { inject(); } catch (e) {} return r; };
    window.renderSettings.__a11y = true;
  }
  function onSet(el) {
    var k = el.dataset.k, v = el.dataset.arg;
    if (!window.S || !S.set) return;
    if (k === 'palette') S.set.palette = v === 'on' ? 'contrast' : 'normal';
    else if (k === 'calm') S.set.calm = v === 'on';
    else if (k === 'colorHelp' || k === 'textSize') S.set[k] = v;
    else return;
    if (typeof persist === 'function') persist();
    apply();
    if (window.Snd && Snd.click) Snd.click();
    if (k !== 'calm' && window.T3 && T3.supported && T3.retheme) { try { T3.retheme(); } catch (e) {} }  // new cube faces / zone edges / 3D label size
    try { window.dispatchEvent(new CustomEvent('a11ychange', { detail: { k: k, key: key() } })); } catch (e) {}  // other 3D views (On-Sets) redraw their textures
    var box = document.getElementById('settings'), top = box ? box.scrollTop : 0;
    if (typeof renderSettings === 'function' && box && box.classList.contains('on')) { renderSettings(); box.scrollTop = top; var b = box.querySelector('[data-act="a11ySet"][data-k="' + k + '"].on, [data-act="a11ySet"][data-k="' + k + '"].btn'); if (b && b.focus) try { b.focus({ preventScroll: true }); } catch (e) {} }
  }

  // ---------- icon-only buttons get a spoken name; long-press shows a name on touch ----------
  var NAMES = { home: 'Home', back: 'Back', closeModal: 'Close', menu: 'Menu', pause: 'Pause', help: 'Help', settings: 'Settings', sound: 'Sound', toggleMute: 'Sound on or off', hint: 'Hint', undo: 'Undo', bUndo: 'Undo', bClear: 'Clear', orbitSeat: 'Back to my seat', photo: 'Take a photo' };
  function nameIcons(rootEl) {
    var R = rootEl || document, i;
    // tappable things that are not buttons (cards, tiles, cubes) can be reached with Tab and pressed with Enter / Space
    var taps = R.querySelectorAll('[data-act]:not(button):not(a):not(input):not(select):not(textarea):not(section):not([tabindex]), #game .z-res .cube:not([tabindex])');
    for (i = 0; i < taps.length; i++) { taps[i].setAttribute('tabindex', '0'); if (!taps[i].getAttribute('role')) taps[i].setAttribute('role', 'button'); }
    // a cube says its colour as well as its symbol ("red 7")
    var cubes = R.querySelectorAll('.cube:is(.c-red,.c-blue,.c-green,.c-black):not([aria-label])');
    for (i = 0; i < cubes.length; i++) { var c = cubes[i], col = /c-(red|blue|green|black)/.exec(c.className)[1]; c.setAttribute('aria-label', col + ' ' + (c.textContent || '').trim() + (c.classList.contains('locked') ? ' (locked)' : '')); }
    var els = R.querySelectorAll('button:not([aria-label]), [role="button"]:not([aria-label])');
    for (i = 0; i < els.length; i++) {
      var b = els[i]; if ((b.textContent || '').replace(/\s+/g, '').length) continue;
      var n = b.getAttribute('title') || NAMES[b.dataset && b.dataset.act] || '';
      if (n) b.setAttribute('aria-label', n);
    }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target; if (!t || !t.getAttribute || t.getAttribute('role') !== 'button' || /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    e.preventDefault(); t.click();
  });
  var pend = 0;
  function watch() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function () { if (pend) return; pend = setTimeout(function () { pend = 0; nameIcons(); }, 60); }).observe(document.body, { childList: true, subtree: true });
    nameIcons();
  }
  var tipEl = null, tipT = 0, hideT = 0, sx = 0, sy = 0;
  function tipFor(el) { return el.getAttribute('data-tip') || el.getAttribute('title') || el.getAttribute('aria-label') || ''; }
  function showTip(el) {
    var t = tipFor(el); if (!t) return;
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'a11y-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    tipEl.textContent = t; tipEl.style.display = 'block';
    var r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    tipEl.style.top = (r.top - h - 8 < 6 ? r.bottom + 8 : r.top - h - 8) + 'px';
    clearTimeout(hideT); hideT = setTimeout(function () { if (tipEl) tipEl.style.display = 'none'; }, 1800);
  }
  var TIPSEL = '.kit-dot, [data-tip], .swatch[title], .sea-f[title]';
  function longPress() {
    document.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      var el = e.target.closest && e.target.closest(TIPSEL); if (!el) return;
      sx = e.clientX; sy = e.clientY; clearTimeout(tipT); tipT = setTimeout(function () { showTip(el); }, 450);
    }, true);
    document.addEventListener('pointermove', function (e) { if (tipT && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { clearTimeout(tipT); tipT = 0; } }, true);
    ['pointerup', 'pointercancel'].forEach(function (n) { document.addEventListener(n, function () { clearTimeout(tipT); tipT = 0; }, true); });
  }

  function start() {
    apply(); hookSettings(); watch(); longPress();
    if (window.ACT && !ACT.a11ySet) ACT.a11ySet = onSet;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  apply();
  if (window.ACT) ACT.a11ySet = onSet;
  hookSettings();

  return { cubeMark: cubeMark, dotShape: dotShape, drawFacePattern: drawFacePattern, drawDot: drawDot, faceCols: faceCols, zoneStyle: zoneStyle, drawHatch: drawHatch,
    textScale: textScale, calm: calm, patterns: patterns, letters: letters, hc: hc, key: key, apply: apply, settingsHTML: settingsHTML, cvd: cvd, _onSet: onSet };
})();
