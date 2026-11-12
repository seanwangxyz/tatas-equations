'use strict';
// ======================= MY KIT =======================
// The kid designs his own kit: shirt colour, pattern, trim, shorts, number, hair colour and style, and the win
// celebration his 3D player does after a match win. Opened from the Locker Room / Trophy Room button
// (data-act="openKit"). Saved in S.kit; the number stays in S.jersey (the HUD and Team-up read it from there).
//
//   S.kit = { shirt, pattern, trim, shorts, hair, hairStyle, celebrate }
//   Kit.get()              the saved kit, with defaults filled in (today's look: red waves, green trim)
//   Kit.open()             show the panel
//   Kit.celebOpen(id)      is that celebration unlocked?   Kit.celebrations()  the list with lock state
//
// Live preview: a 3D picture (T3.playerPortrait) when 3D is on, else a flat drawing of the kit.
// No real club or national crests, maker logos or real players: plain colours and patterns only.
var Kit = (function () {
  var SHIRTS = [['#c9342c', 'Red'], ['#1c7ed6', 'Blue'], ['#4dabf7', 'Sky blue'], ['#2f9e44', 'Green'], ['#f5c518', 'Yellow'],
    ['#f76707', 'Orange'], ['#7048e8', 'Purple'], ['#e64980', 'Pink'], ['#25262b', 'Black'], ['#f1f3f5', 'White']];
  var TRIMS = [['#2f8f7c', 'Sea green'], ['#ffffff', 'White'], ['#ffd43b', 'Gold'], ['#1f3a68', 'Navy'], ['#25262b', 'Black'], ['#c9342c', 'Red'], ['#4dabf7', 'Sky blue'], ['#f76707', 'Orange']];
  var SHORTS = [['#1f6b5a', 'Deep green'], ['#ffffff', 'White'], ['#1f3a68', 'Navy'], ['#25262b', 'Black'], ['#c9342c', 'Red'], ['#2f9e44', 'Green'], ['#7048e8', 'Purple'], ['#868e96', 'Grey']];
  var PATTERNS = [['plain', 'Plain'], ['waves', 'Waves'], ['stripes', 'Stripes'], ['hoops', 'Hoops'], ['sash', 'Sash']];
  var HAIR = [['#3b2314', 'Dark brown'], ['#15110e', 'Black'], ['#7b5536', 'Light brown'], ['#d9a441', 'Golden'], ['#b5562a', 'Ginger']];
  var STYLES = [['swept', 'Swept fringe'], ['short', 'Short'], ['spiky', 'Spiky'], ['curly', 'Curly'], ['long', 'Long']];
  // Win celebrations: two from the start, two earned by skill (never by luck)
  var CELEB = [
    { id: 'jump', name: 'Rocket Jump', icon: '🚀', how: 'A big jump with a fist to the sky' },
    { id: 'spin', name: 'Spin & Point', icon: '🌀', how: 'One full spin, then point at the sky' },
    { id: 'robot', name: 'Robot Dance', icon: '🤖', how: 'Four stiff robot moves', crown: 1 },
    { id: 'slide', name: 'Knee Slide', icon: '⚡', how: 'Slide on your knees, arms up', beat: 3 }
  ];
  function defaults() { return { shirt: '#c9342c', pattern: 'waves', trim: '#2f8f7c', shorts: '#1f6b5a', hair: '#3b2314', hairStyle: 'swept', celebrate: 'jump' }; }
  function get() {
    var d = defaults();
    if (!S.kit || typeof S.kit !== 'object') S.kit = {};
    Object.keys(d).forEach(function (k) { if (S.kit[k] == null) S.kit[k] = d[k]; });
    return S.kit;
  }
  function beatCount() { return (S.beaten || []).filter(Boolean).length; }
  function lvl() { return typeof level === 'function' ? level() : 1; }
  function find(id) { for (var i = 0; i < CELEB.length; i++) if (CELEB[i].id === id) return CELEB[i]; return null; }
  function celebOpen(id) {
    var c = typeof id === 'string' ? find(id) : id; if (!c) return false;
    if (S.unlockAll) return true;
    if (c.crown) return crownCount() >= c.crown;
    if (c.lvl) return lvl() >= c.lvl;
    if (c.beat) return beatCount() >= c.beat;
    return true;
  }
  function crownCount() { return window.Trio ? Trio.crowns() : 0; }
  function lockText(c) { return c.crown ? 'Win a crown in Three at the table' : c.lvl ? 'Reach Level ' + c.lvl : c.beat ? 'Beat ' + c.beat + ' different creatures (' + Math.min(beatCount(), c.beat) + '/' + c.beat + ')' : ''; }
  // the celebration to play after a win: the chosen one if it is unlocked, else the Rocket Jump
  function celebration() { var k = get(); return celebOpen(k.celebrate) ? k.celebrate : 'jump'; }

  // ---------- flat preview (no 3D, or while the 3D picture is being drawn) ----------
  function shade(hex, t) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, m = t < 0 ? 0 : 255, a = Math.abs(t);
    r = Math.round(r + (m - r) * a); g = Math.round(g + (m - g) * a); b = Math.round(b + (m - b) * a);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function light(hex) { var n = parseInt(hex.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) > 204; }
  function flatHTML(k, num) {
    var dk = shade(k.shirt, -0.18), lt = shade(k.shirt, 0.24), pat = '';
    if (k.pattern === 'stripes') for (var x = 20; x < 180; x += 22) pat += '<rect x="' + x + '" y="0" width="11" height="200" fill="' + dk + '"/>';
    else if (k.pattern === 'hoops') for (var y = 40; y < 200; y += 26) pat += '<rect x="0" y="' + y + '" width="200" height="12" fill="' + dk + '"/>';
    else if (k.pattern === 'sash') pat = '<path d="M40 20 L75 20 L170 200 L135 200 Z" fill="' + dk + '"/>';
    else if (k.pattern === 'waves') for (var w = 36; w < 200; w += 11) pat += '<path d="M0 ' + w + ' q12 -4 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0" fill="none" stroke="' + lt + '" stroke-width="1.6" opacity=".6"/>';
    var ink = light(k.shirt) ? '#1d2b3a' : '#ffffff', edge = light(k.shirt) ? '#ffffff' : k.trim;
    var shirt = 'M60 18 L82 10 Q100 22 118 10 L140 18 L182 46 L164 78 L146 68 L146 168 L54 168 L54 68 L36 78 L18 46 Z';
    return '<svg class="kit-flat" viewBox="0 0 200 250" aria-hidden="true"><defs><clipPath id="kitClip"><path d="' + shirt + '"/></clipPath></defs>' +
      '<rect x="56" y="166" width="88" height="56" rx="8" fill="' + k.shorts + '"/><rect x="98" y="172" width="4" height="50" fill="rgba(0,0,0,.15)"/>' +
      '<g clip-path="url(#kitClip)"><rect width="200" height="200" fill="' + k.shirt + '"/>' + pat + '</g>' +
      '<path d="' + shirt + '" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M82 10 Q100 22 118 10" fill="none" stroke="' + k.trim + '" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M18 46 L36 78 M182 46 L164 78" stroke="' + k.trim + '" stroke-width="6" stroke-linecap="round"/>' +
      '<text x="100" y="128" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="62" fill="' + ink + '" stroke="' + edge + '" stroke-width="3" paint-order="stroke">' + esc(num) + '</text>' +
      '<text x="100" y="62" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="15" fill="' + ink + '">' + esc(String(S.name || '').toUpperCase().slice(0, 12)) + '</text></svg>';
  }

  // ---------- 3D preview ----------
  var shots = { front: null, back: null }, serial = 0;
  function has3D() { return typeof T3 !== 'undefined' && T3 && T3.playerPortrait && T3.ctx && S.set.three !== false; }
  function preview() {
    if (!has3D()) return;
    var my = ++serial;
    ['front', 'back'].forEach(function (v) {
      T3.playerPortrait(null, 240, v).then(function (url) {
        if (!url || my !== serial) return; shots[v] = url;
        var img = document.querySelector('.kit-pv img[data-v="' + v + '"]'); if (img) { img.src = url; img.parentNode.classList.add('ready'); }
      });
    });
  }

  // ---------- panel ----------
  function sw(key, list, cur, round) {
    return '<div class="kit-sw">' + list.map(function (c) {
      return '<button class="' + (round === false ? 'kit-chip' : 'kit-dot') + (String(cur).toLowerCase() === c[0] ? ' on' : '') + '" data-act="kitPick" data-k="' + key + '" data-arg="' + c[0] + '" title="' + esc(c[1]) + '" aria-label="' + esc(c[1]) + '"' +
        (round === false ? '>' + esc(c[1]) : ' style="background:' + c[0] + '">') + '</button>';
    }).join('') + '</div>';
  }
  function html() {
    var k = get(), num = String(S.jersey || '7'), pv = has3D();
    var h = '<h2 class="hero">' + (typeof ico === 'function' ? ico('star') : '') + ' My kit</h2><div class="kit">';
    h += '<div class="kit-pv' + (pv ? ' three' : '') + '">' +
      (pv ? ['front', 'back'].map(function (v) { return '<div class="kit-shot' + (shots[v] ? ' ready' : '') + '"><img data-v="' + v + '" alt="" src="' + (shots[v] || '') + '">' + flatHTML(k, num) + '</div>'; }).join('') : flatHTML(k, num)) + '</div>';
    h += '<div class="kit-opts">';
    h += '<h3>Shirt</h3>' + sw('shirt', SHIRTS, k.shirt);
    h += '<h3>Pattern</h3>' + sw('pattern', PATTERNS, k.pattern, false);
    h += '<h3>Trim</h3>' + sw('trim', TRIMS, k.trim);
    h += '<h3>Shorts</h3>' + sw('shorts', SHORTS, k.shorts);
    h += '<h3>Number</h3><div class="kit-num"><button class="btn small" data-act="kitNum" data-arg="-1" aria-label="Smaller number">−</button>' +
      '<input type="number" id="kitNumber" min="1" max="99" inputmode="numeric" value="' + esc(num) + '"><button class="btn small" data-act="kitNum" data-arg="1" aria-label="Bigger number">+</button></div>';
    h += '<h3>Hair colour</h3>' + sw('hair', HAIR, k.hair);
    h += '<h3>Hair style</h3>' + sw('hairStyle', STYLES, k.hairStyle, false);
    h += '<h3>Win celebration</h3><div class="kit-cel">' + CELEB.map(function (c) {
      var open = celebOpen(c), on = k.celebrate === c.id;
      return '<button class="kit-ce' + (on ? ' on' : '') + (open ? '' : ' lock') + '" data-act="' + (open ? 'kitPick' : 'kitLocked') + '" data-k="celebrate" data-arg="' + c.id + '">' +
        '<span class="kit-ci">' + c.icon + '</span><b>' + esc(c.name) + '</b><small>' + (open ? esc(c.how) : (typeof ico === 'function' ? ico('lock') + ' ' : '') + esc(lockText(c))) + '</small></button>';
    }).join('') + '</div>';
    h += '<p class="kit-note">Your player does it once when you win a match.</p>';
    h += '</div></div><div class="row"><button class="btn small" data-act="kitReset">Back to my home kit</button><button class="btn green" data-act="kitDone">Done</button></div>';
    return h;
  }
  function render() {
    var box = document.getElementById('modalBox');
    if (box && document.getElementById('modal').classList.contains('on') && box.querySelector('.kit')) {
      var sc = box.scrollTop; box.innerHTML = html(); box.scrollTop = sc;
    } else modal(html(), function () { if (box) box.classList.remove('kit-modal'); });
    box = document.getElementById('modalBox'); if (box) box.classList.add('kit-modal');
    var inp = document.getElementById('kitNumber');
    if (inp) inp.addEventListener('change', function () { setNum(inp.value); });
    preview();
  }
  function setNum(v) {
    var n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); if (!(n >= 1)) n = 1; if (n > 99) n = 99;
    S.jersey = String(n); persist(); changed();
  }
  function changed() { if (typeof T3 !== 'undefined' && T3.playerRefresh) T3.playerRefresh(); render(); }
  function open() { get(); render(); }

  ACT.openKit = function () { if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop(); open(); };
  ACT.kitPick = function (el) {
    var k = get(), key = el.dataset.k, v = el.dataset.arg;
    if (['shirt', 'pattern', 'trim', 'shorts', 'hair', 'hairStyle', 'celebrate'].indexOf(key) < 0) return;
    k[key] = v; persist(); if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop(); changed();
  };
  ACT.kitNum = function (el) { var n = (parseInt(S.jersey, 10) || 7) + (+el.dataset.arg || 0); if (n < 1) n = 99; if (n > 99) n = 1; setNum(n); };
  ACT.kitLocked = function (el) {
    var c = find(el.dataset.arg); if (typeof Snd !== 'undefined' && Snd.boop) Snd.boop();
    var note = document.querySelector('.kit-note'); if (note && c) note.textContent = c.name + ': ' + lockText(c) + ' to unlock it.';
  };
  ACT.kitReset = function () { var c = get().celebrate; S.kit = defaults(); S.kit.celebrate = c; persist(); changed(); };
  ACT.kitDone = function () { if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); closeModal(); };

  return { get: get, open: open, defaults: defaults, celebOpen: celebOpen, celebration: celebration,
    celebrations: function () { return CELEB.map(function (c) { return { id: c.id, name: c.name, open: celebOpen(c), lock: celebOpen(c) ? '' : lockText(c) }; }); } };
})();
