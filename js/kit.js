'use strict';
// ======================= MY KIT =======================
// The kid designs his kits: a home, an away and a third kit (shirt colour, pattern, trim, shorts, collar, sleeves,
// number style, front number, crest, maker's mark), picks which one he wears, and sets his own things that go with any
// kit (number, boots, captain's armband, goalkeeper gloves, hair, win celebration). Opened from the Trophy Room button
// (data-act="openKit").
//
//   S.kit   = the home kit + his own things: { shirt, pattern, trim, shorts, hair, hairStyle, celebrate,
//             collar, frontNum, crest, mark, sleeves, numStyle, boots, gloves, armband, armbandCol }
//   S.kits  = { away: {...}, third: {...} }   only what he changed (kit keys only); the rest from the slot defaults
//   S.kitUse = 'home' | 'away' | 'third'      which one he wears
//   The number stays in S.jersey (the HUD and Team-up read it from there).
//
//   Kit.get()              the home kit (S.kit) with defaults filled in
//   Kit.current()          the kit he wears now (merged, same shape as S.kit)
//   Kit.open()             show the panel
//   Kit.celebOpen(id)      is that celebration unlocked?   Kit.celebrations()  the list with lock state
//
// Live preview: 3D pictures (T3.playerPortrait) when 3D is on, else a flat drawing of the kit.
// Crests and maker's marks are the game's own designs (drawn in js/three/creatures/kid.js, thumbnails via
// window.KitArt): no real club or national crests, maker logos or real players.
var Kit = (function () {
  var SHIRTS = [['#c9342c', 'Red'], ['#1c7ed6', 'Blue'], ['#4dabf7', 'Sky blue'], ['#2f9e44', 'Green'], ['#16403d', 'Dark teal'], ['#f5c518', 'Yellow'],
    ['#f76707', 'Orange'], ['#7048e8', 'Purple'], ['#e64980', 'Pink'], ['#25262b', 'Black'], ['#f1f3f5', 'White']];
  var TRIMS = [['#2f8f7c', 'Sea green'], ['#ffffff', 'White'], ['#cfe3e6', 'Ice blue'], ['#ffd43b', 'Gold'], ['#1f3a68', 'Navy'], ['#25262b', 'Black'], ['#c9342c', 'Red'], ['#4dabf7', 'Sky blue'], ['#f76707', 'Orange']];
  var SHORTS = [['#1f6b5a', 'Deep green'], ['#ffffff', 'White'], ['#1f3a68', 'Navy'], ['#1d2b3a', 'Midnight'], ['#25262b', 'Black'], ['#c9342c', 'Red'], ['#2f9e44', 'Green'], ['#7048e8', 'Purple'], ['#868e96', 'Grey']];
  var PATTERNS = [['plain', 'Plain'], ['waves', 'Waves'], ['stripes', 'Stripes'], ['hoops', 'Hoops'], ['sash', 'Sash']];
  var COLLARS = [['v', 'V-neck'], ['round', 'Round']];
  var SLEEVES = [['short', 'Short'], ['long', 'Long']];
  var NUMSTYLES = [['thin', 'Tall & thin'], ['block', 'Block'], ['round', 'Rounded'], ['college', 'College'], ['outline', 'Outline']];
  var ONOFF = [['on', 'On'], ['off', 'Off']];
  var CRESTS = [['cube', 'Cube shield'], ['roundel', 'Star roundel'], ['star', 'Star stripes'], ['ribbon', 'Plus ribbon'], ['dice', 'Dice sun'], ['diamond', 'Equals diamond']];
  var MARKS = [['cube', 'Speed cube'], ['swift', 'Swift'], ['fox', 'Fox'], ['rocket', 'Rocket'], ['bolt', 'Bolt'], ['pip', 'Pip']];
  var BOOTS = [['#1f2430', 'Black'], ['#f8f9fa', 'White'], ['#c9342c', 'Red'], ['#f5c518', 'Gold'], ['#4dabf7', 'Sky blue'], ['#f76707', 'Orange'], ['#e64980', 'Pink'], ['#2f9e44', 'Green']];
  var ARMBANDS = [['#ffd43b', 'Yellow'], ['#ffffff', 'White'], ['#25262b', 'Black'], ['#4dabf7', 'Sky blue'], ['#f76707', 'Orange'], ['#e64980', 'Pink']];
  var HAIR = [['#3b2314', 'Dark brown'], ['#15110e', 'Black'], ['#7b5536', 'Light brown'], ['#d9a441', 'Golden'], ['#b5562a', 'Ginger']];
  var STYLES = [['swept', 'Swept fringe'], ['short', 'Short'], ['spiky', 'Spiky'], ['curly', 'Curly'], ['long', 'Long']];
  var SLOTS = [['home', 'Home'], ['away', 'Away'], ['third', 'Third']];
  // keys that belong to a kit (differ between home / away / third) and keys that are his own (the same in every kit)
  var KIT_KEYS = ['shirt', 'pattern', 'trim', 'trim2', 'shorts', 'collar', 'frontNum', 'crest', 'mark', 'sleeves', 'numStyle'];
  var OWN_KEYS = ['hair', 'hairStyle', 'celebrate', 'boots', 'gloves', 'armband', 'armbandCol'];
  // Win celebrations: two from the start, two earned by skill (never by luck)
  var CELEB = [
    { id: 'jump', name: 'Rocket Jump', icon: '🚀', how: 'A big jump with a fist to the sky' },
    { id: 'spin', name: 'Spin & Point', icon: '🌀', how: 'One full spin, then point at the sky' },
    { id: 'robot', name: 'Robot Dance', icon: '🤖', how: 'Four stiff robot moves', crown: 1 },
    { id: 'slide', name: 'Knee Slide', icon: '⚡', how: 'Slide on your knees, arms up', beat: 3 }
  ];
  // the reference look: deep red waves, teal V-neck band, icy-blue tall thin number, our cube crest and speed-cube mark
  function defaults() {
    return { shirt: '#c9342c', pattern: 'waves', trim: '#2f8f7c', shorts: '#1f6b5a', hair: '#3b2314', hairStyle: 'swept', celebrate: 'jump',
      collar: 'v', frontNum: true, crest: 'cube', mark: 'cube', sleeves: 'short', numStyle: 'thin', boots: '#1f2430', gloves: false, armband: false, armbandCol: '#ffd43b' };
  }
  var SLOT_DEF = {
    away: { shirt: '#f1f3f5', pattern: 'waves', trim: '#2f8f7c', trim2: '#c9342c', shorts: '#1d2b3a', collar: 'v', frontNum: true, crest: 'cube', mark: 'cube', sleeves: 'short', numStyle: 'thin' },
    third: { shirt: '#16403d', pattern: 'waves', trim: '#cfe3e6', trim2: '#2f8f7c', shorts: '#25262b', collar: 'round', frontNum: true, crest: 'cube', mark: 'cube', sleeves: 'long', numStyle: 'block' }
  };
  function get() {
    var d = defaults();
    if (!S.kit || typeof S.kit !== 'object') S.kit = {};
    Object.keys(d).forEach(function (k) { if (S.kit[k] == null) S.kit[k] = d[k]; });
    if (!S.kits || typeof S.kits !== 'object') S.kits = {};
    if (!S.kits.away || typeof S.kits.away !== 'object') S.kits.away = {};
    if (!S.kits.third || typeof S.kits.third !== 'object') S.kits.third = {};
    if (S.kitUse !== 'away' && S.kitUse !== 'third') S.kitUse = 'home';
    return S.kit;
  }
  // a slot as a full kit (same shape as S.kit): home = S.kit; away / third = defaults + his changes + his own things
  function view(slot) {
    var home = get(); if (slot !== 'away' && slot !== 'third') return home;
    var v = {}, st = S.kits[slot] || {};
    Object.keys(SLOT_DEF[slot]).forEach(function (k) { v[k] = st[k] != null ? st[k] : SLOT_DEF[slot][k]; });
    OWN_KEYS.forEach(function (k) { v[k] = home[k]; });
    return v;
  }
  function current() { get(); return view(S.kitUse); }
  var editing = null;                          // the slot shown in the panel
  function slotNow() { return editing || (get(), S.kitUse) || 'home'; }

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
  function lum(hex) { var n = parseInt(hex.slice(1), 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; }
  function accentOf(k) { return lum(k.shirt) > 0.55 ? (lum(k.trim) < 0.5 ? k.trim : '#1d2b3a') : '#cfe3e6'; }
  var flatId = 0;
  function flatHTML(k, num, back) {
    var id = 'kc' + (++flatId), dk = shade(k.shirt, -0.18), lt = lum(k.shirt) > 0.8 ? shade(k.shirt, -0.12) : shade(k.shirt, 0.24), pat = '';
    if (k.pattern === 'stripes') for (var x = 20; x < 180; x += 22) pat += '<rect x="' + x + '" y="0" width="11" height="200" fill="' + dk + '"/>';
    else if (k.pattern === 'hoops') for (var y = 40; y < 200; y += 26) pat += '<rect x="0" y="' + y + '" width="200" height="12" fill="' + dk + '"/>';
    else if (k.pattern === 'sash') pat = '<path d="M40 20 L75 20 L170 200 L135 200 Z" fill="' + dk + '"/>';
    else if (k.pattern === 'waves') for (var w = 30; w < 200; w += 8) pat += '<path d="M0 ' + w + ' q6 -2.5 12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0" fill="none" stroke="' + lt + '" stroke-width="1.2" opacity=".55"/>';
    var acc = accentOf(k), t2 = k.trim2 || k.shirt, long = k.sleeves === 'long';
    var shirt = long ? 'M60 18 L82 10 Q100 22 118 10 L140 18 L172 60 L178 150 L160 152 L150 80 L146 168 L54 168 L50 80 L40 152 L22 150 L28 60 Z'
      : 'M60 18 L82 10 Q100 22 118 10 L140 18 L182 46 L164 78 L146 68 L146 168 L54 168 L54 68 L36 78 L18 46 Z';
    var h = '<svg class="kit-flat" viewBox="0 0 200 250" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="' + shirt + '"/></clipPath></defs>' +
      '<rect x="56" y="166" width="88" height="56" rx="8" fill="' + k.shorts + '"/><rect x="56" y="166" width="7" height="56" fill="' + k.trim + '"/><rect x="137" y="166" width="7" height="56" fill="' + k.trim + '"/>' +
      '<g clip-path="url(#' + id + ')"><rect width="200" height="200" fill="' + k.shirt + '"/>' + pat + '</g>' +
      '<path d="' + shirt + '" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="3" stroke-linejoin="round"/>';
    // collar
    if (back || k.collar === 'round') h += '<path d="M82 10 Q100 24 118 10" fill="none" stroke="' + k.trim + '" stroke-width="7" stroke-linecap="round"/>';
    else h += '<path d="M84 10 L100 40 L116 10 Z" fill="#efc19d"/><path d="M82 9 L100 44 L118 9" fill="none" stroke="' + k.trim + '" stroke-width="7" stroke-linejoin="miter"/><path d="M83 9 L100 41 L117 9" fill="none" stroke="' + t2 + '" stroke-width="1.4"/>';
    // cuffs
    h += long ? '<path d="M22 150 L40 152 M160 152 L178 150" stroke="' + k.trim + '" stroke-width="6" stroke-linecap="round"/>'
      : '<path d="M18 46 L36 78 M182 46 L164 78" stroke="' + k.trim + '" stroke-width="6" stroke-linecap="round"/>';
    if (k.armband) h += long ? '<path d="M172 70 L152 76" stroke="' + k.armbandCol + '" stroke-width="9"/>' : '<path d="M176 56 L160 72" stroke="' + k.armbandCol + '" stroke-width="8"/>';
    var art = window.KitArt;
    if (back) {
      h += '<text x="100" y="128" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="62" fill="' + acc + '" stroke="' + (lum(k.shirt) > 0.55 ? '#ffffff' : k.trim) + '" stroke-width="3" paint-order="stroke">' + esc(num) + '</text>' +
        '<text x="100" y="62" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="15" fill="' + acc + '">' + esc(String(typeof backName === 'function' ? backName() : (S.name || '')).toUpperCase().slice(0, 12)) + '</text>';
    } else {
      if (k.frontNum !== false) h += '<text x="100" y="132" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-size="56" fill="' + acc + '" transform="translate(100 0) scale(.62 1) translate(-100 0)">' + esc(num) + '</text>';
      if (art && k.crest !== 'none') h += '<image href="' + art.crestURL(k.crest, 64) + '" x="118" y="44" width="20" height="23"/>';
      if (art && k.mark !== 'none') h += '<image href="' + art.markURL(k.mark, acc, 64) + '" x="64" y="47" width="16" height="16"/>';
    }
    return h + '</svg>';
  }

  // ---------- 3D preview ----------
  var shots = { front: null, back: null }, serial = 0;
  function has3D() { return typeof T3 !== 'undefined' && T3 && T3.playerPortrait && T3.ctx && S.set.three !== false; }
  var VIEWS = { front: { yaw: -0.22 }, back: 'back' };
  function preview() {
    if (!has3D()) return;
    var my = ++serial, o = { kit: Object.assign({ trim2: null }, view(slotNow())) };   // trim2: null = the slot's own (or the shirt colour)
    ['front', 'back'].forEach(function (v) {
      T3.playerPortrait(o, v === 'front' ? 512 : 320, VIEWS[v]).then(function (url) {
        if (!url || my !== serial) return; shots[v] = url;
        document.querySelectorAll('.kit-pv img[data-v="' + v + '"]').forEach(function (img) { img.src = url; img.parentNode.classList.add('ready'); });
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
  // crest / mark picker: picture tiles (from KitArt) plus "None"
  function art(key, list, cur, k) {
    var A = window.KitArt, acc = accentOf(k), bg = k.shirt;
    return '<div class="kit-art">' + list.concat([['none', 'None']]).map(function (c) {
      var pic = c[0] === 'none' ? '<span class="kit-none">—</span>' : !A ? '' : key === 'crest' ? '<img alt="" src="' + A.crestURL(c[0], 96) + '">' : '<span class="kit-ab" style="background:' + bg + '"><img alt="" src="' + A.markURL(c[0], acc, 96) + '"></span>';
      return '<button class="kit-at' + (cur === c[0] ? ' on' : '') + '" data-act="kitPick" data-k="' + key + '" data-arg="' + c[0] + '" title="' + esc(c[1]) + '" aria-label="' + esc(c[1]) + '"' +
        '>' + pic + '<small>' + esc(c[1]) + '</small></button>';
    }).join('') + '</div>';
  }
  function html() {
    var home = get(), slot = slotNow(), k = view(slot), num = String(S.jersey || '7'), pv = has3D(), use = S.kitUse;
    var h = '<h2 class="hero">' + (typeof ico === 'function' ? ico('star') : '') + ' My kit</h2>';
    h += '<div class="kit-slots" role="tablist">' + SLOTS.map(function (s) {
      return '<button role="tab" aria-selected="' + (s[0] === slot) + '" class="kit-slot' + (s[0] === slot ? ' on' : '') + '" data-act="kitSlot" data-arg="' + s[0] + '">' +
        '<span class="kit-sd" style="background:' + view(s[0]).shirt + '"></span>' + s[1] + (s[0] === use ? '<small>wearing</small>' : '') + '</button>';
    }).join('') + (slot !== use ? '<button class="btn small green kit-wear" data-act="kitWear">Wear the ' + slot + ' kit</button>' : '') + '</div>';
    h += '<div class="kit">';
    h += '<div class="kit-pv' + (pv ? ' three' : '') + '">' + (pv
      ? ['front', 'back'].map(function (v) { return '<div class="kit-shot' + (shots[v] ? ' ready' : '') + '"><img data-v="' + v + '" alt="" src="' + (shots[v] || '') + '">' + flatHTML(k, num, v === 'back') + '</div>'; }).join('') +
        '<div class="kit-shot kit-zoom' + (shots.front ? ' ready' : '') + '" aria-hidden="true"><img data-v="front" alt="" src="' + (shots.front || '') + '"></div>'
      : flatHTML(k, num, false) + flatHTML(k, num, true)) + '</div>';
    h += '<div class="kit-opts">';
    h += '<h3>Shirt</h3>' + sw('shirt', SHIRTS, k.shirt);
    h += '<h3>Pattern</h3>' + sw('pattern', PATTERNS, k.pattern, false);
    h += '<h3>Trim</h3>' + sw('trim', TRIMS, k.trim);
    h += '<h3>Shorts</h3>' + sw('shorts', SHORTS, k.shorts);
    h += '<div class="kit-two"><div><h3>Collar</h3>' + sw('collar', COLLARS, k.collar, false) + '</div><div><h3>Sleeves</h3>' + sw('sleeves', SLEEVES, k.sleeves, false) + '</div></div>';
    h += '<h3>Number style</h3>' + sw('numStyle', NUMSTYLES, k.numStyle, false);
    h += '<h3>Number on the front</h3>' + sw('frontNum', ONOFF, k.frontNum === false ? 'off' : 'on', false);
    h += '<h3>Crest</h3>' + art('crest', CRESTS, k.crest, k);
    h += '<h3>Maker\'s mark</h3>' + art('mark', MARKS, k.mark, k);
    h += '<h3 class="kit-me">In every kit</h3>';
    h += '<h3>Number</h3><div class="kit-num"><button class="btn small" data-act="kitNum" data-arg="-1" aria-label="Smaller number">−</button>' +
      '<input type="number" id="kitNumber" min="1" max="99" inputmode="numeric" value="' + esc(num) + '"><button class="btn small" data-act="kitNum" data-arg="1" aria-label="Bigger number">+</button></div>';
    h += '<h3>Boots</h3>' + sw('boots', BOOTS, home.boots);
    h += '<h3>Captain\'s armband</h3><div class="kit-sw"><button class="kit-chip' + (home.armband ? '' : ' on') + '" data-act="kitPick" data-k="armband" data-arg="off">Off</button></div>' +
      sw('armbandCol', ARMBANDS, home.armband ? home.armbandCol : '');
    h += '<h3>Goalkeeper gloves</h3>' + sw('gloves', ONOFF, home.gloves ? 'on' : 'off', false);
    h += '<h3>Hair colour</h3>' + sw('hair', HAIR, home.hair);
    h += '<h3>Hair style</h3>' + sw('hairStyle', STYLES, home.hairStyle, false);
    h += '<h3>Win celebration</h3><div class="kit-cel">' + CELEB.map(function (c) {
      var open = celebOpen(c), on = home.celebrate === c.id;
      return '<button class="kit-ce' + (on ? ' on' : '') + (open ? '' : ' lock') + '" data-act="' + (open ? 'kitPick' : 'kitLocked') + '" data-k="celebrate" data-arg="' + c.id + '">' +
        '<span class="kit-ci">' + c.icon + '</span><b>' + esc(c.name) + '</b><small>' + (open ? esc(c.how) : (typeof ico === 'function' ? ico('lock') + ' ' : '') + esc(lockText(c))) + '</small></button>';
    }).join('') + '</div>';
    h += '<p class="kit-note">Your player does it once when you win a match.</p>';
    h += '</div></div><div class="row"><button class="btn small" data-act="kitReset">Reset the ' + slot + ' kit</button><button class="btn green" data-act="kitDone">Done</button></div>';
    return h;
  }
  function render() {
    var box = document.getElementById('modalBox');
    if (box && document.getElementById('modal').classList.contains('on') && box.querySelector('.kit')) {
      var sc = box.scrollTop; box.innerHTML = html(); box.scrollTop = sc;
    } else modal(html(), function () { if (box) box.classList.remove('kit-modal'); editing = null; });
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
  function open() { get(); editing = S.kitUse; render(); }
  function pop() { if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop(); }

  ACT.openKit = function () { pop(); open(); };
  ACT.kitSlot = function (el) { var s = el.dataset.arg; if (s !== 'home' && s !== 'away' && s !== 'third') return; editing = s; shots = { front: null, back: null }; pop(); render(); };
  ACT.kitWear = function () { get(); S.kitUse = slotNow(); persist(); if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); changed(); };
  ACT.kitPick = function (el) {
    var home = get(), key = el.dataset.k, v = el.dataset.arg, slot = slotNow();
    if (KIT_KEYS.indexOf(key) < 0 && OWN_KEYS.indexOf(key) < 0) return;
    if (key === 'frontNum' || key === 'gloves' || key === 'armband') v = v === 'on';
    if (key === 'armbandCol') home.armband = true;
    if (OWN_KEYS.indexOf(key) >= 0 || slot === 'home') home[key] = v;
    else S.kits[slot][key] = v;
    persist(); pop(); changed();
  };
  ACT.kitNum = function (el) { var n = (parseInt(S.jersey, 10) || 7) + (+el.dataset.arg || 0); if (n < 1) n = 99; if (n > 99) n = 1; setNum(n); };
  ACT.kitLocked = function (el) {
    var c = find(el.dataset.arg); if (typeof Snd !== 'undefined' && Snd.boop) Snd.boop();
    var note = document.querySelector('.kit-note'); if (note && c) note.textContent = c.name + ': ' + lockText(c) + ' to unlock it.';
  };
  // reset the kit being edited to its defaults (his own things - hair, boots, armband, gloves, celebration - stay)
  ACT.kitReset = function () {
    var home = get(), slot = slotNow();
    if (slot === 'home') { var d = defaults(); KIT_KEYS.forEach(function (k) { if (d[k] != null) home[k] = d[k]; else delete home[k]; }); }
    else S.kits[slot] = {};
    persist(); changed();
  };
  ACT.kitDone = function () { if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); closeModal(); };

  return { get: get, current: current, open: open, defaults: defaults, celebOpen: celebOpen, celebration: celebration,
    celebrations: function () { return CELEB.map(function (c) { return { id: c.id, name: c.name, open: celebOpen(c), lock: celebOpen(c) ? '' : lockText(c) }; }); } };
})();
