'use strict';
// ======================= MY KIT =======================
// The kid designs his kits: a home, an away and a third kit (shirt colour, pattern, trim, shorts, collar, sleeves,
// number style, front number, crest, maker's mark), picks which one he wears, and sets his own things that go with any
// kit (number, boots, captain's armband, goalkeeper gloves, win celebration). Opened from the Trophy Room button
// (data-act="openKit"). Hair now lives in the avatar maker (js/avatar.js); old saves keep S.kit.hair / hairStyle and
// People.own() still reads them.
//
//   S.kit   = the home kit + his own things: { shirt, pattern, trim, shorts, hair, hairStyle, celebrate,
//             collar, frontNum, crest, mark, sleeves, numStyle, boots, gloves, armband, armbandCol }
//   S.kits  = { away: {...}, third: {...} }   only what he changed (kit keys only); the rest from the slot defaults
//   S.kitUse = 'home' | 'away' | 'third'      which one he wears
//   The number stays in S.jersey (the HUD and Team-up read it from there).
//
//   Kit.get()              the home kit (S.kit) with defaults filled in
//   Kit.current()          the kit he wears now (merged, same shape as S.kit)
//   Kit.open()             show the panel for the save's own kits (exactly as before)
//   Kit.open({ kind: 'crew', id })    the kits of another player on this device (S.crew; saved through People.saveMember)
//   Kit.open({ kind: 'draft', person, onDone })   edit person.kit / kits / kitUse / jersey in place, save nothing
//                          (the avatar maker uses this; person also has name, back, avatar). onDone() when it closes.
//                          Any target may carry onDone.
//   Kit.fill(k)            a saved-shape kit (or People.kitOf()) with every default filled in (full kit)
//   Kit.viewOf(person)     the kit a person object (kit / kits / kitUse) wears now, full
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
  var SLOTS = [['home', 'Home'], ['away', 'Away'], ['third', 'Third']];
  // keys that belong to a kit (differ between home / away / third) and keys that are his own (the same in every kit)
  var KIT_KEYS = ['shirt', 'pattern', 'trim', 'trim2', 'shorts', 'collar', 'frontNum', 'crest', 'mark', 'sleeves', 'numStyle'];
  var OWN_KEYS = ['hair', 'hairStyle', 'celebrate', 'boots', 'gloves', 'armband', 'armbandCol'];
  // Win celebrations: two from the start, two earned by skill (never by luck)
  var CELEB = [
    { id: 'jump', name: 'Rocket Jump', icon: '🚀', how: 'A big jump with a fist to the sky' },
    { id: 'spin', name: 'Spin & Point', icon: '🌀', how: 'One full spin, then point at the sky' },
    { id: 'robot', name: 'Robot Dance', icon: '🤖', how: 'Four stiff robot moves', crown: 1 },
    { id: 'slide', name: 'Knee Slide', icon: '⚡', how: 'Slide on your knees, arms up', beat: 3 },
    { id: 'plane', name: 'Aeroplane', icon: '✈️', how: 'Run out with your arms out like wings' },
    { id: 'heel', name: 'Heel Click', icon: '👟', how: 'Jump and click your heels together' },
    { id: 'brain', name: 'Big Brain', icon: '🧠', how: 'Fingers to your temple, then point at the table', lvl: 3 },
    { id: 'number', name: "That's Me", icon: '🔟', how: 'Show off the name and number on your back', beat: 2 }
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
  // whose kits the panel edits: null = the save's own (S.kit / S.kits / S.kitUse / S.jersey), else
  // { h: an object with kit / kits / kitUse / jersey (and name, back, avatar), save: function or null, onDone }
  var who = null;
  function hold() { return who ? who.h : S; }
  // fill the defaults into a holder (S, a crew member or a draft) and return its home kit
  function prep(h) {
    var d = defaults();
    if (!h.kit || typeof h.kit !== 'object') h.kit = {};
    Object.keys(d).forEach(function (k) { if (h.kit[k] == null) h.kit[k] = d[k]; });
    if (!h.kits || typeof h.kits !== 'object') h.kits = {};
    if (!h.kits.away || typeof h.kits.away !== 'object') h.kits.away = {};
    if (!h.kits.third || typeof h.kits.third !== 'object') h.kits.third = {};
    if (h.kitUse !== 'away' && h.kitUse !== 'third') h.kitUse = 'home';
    return h.kit;
  }
  function get() { return prep(S); }
  // a slot as a full kit (same shape as S.kit): home = S.kit; away / third = defaults + his changes + his own things
  function view(slot, h) {
    h = h || hold();
    var home = prep(h); if (slot !== 'away' && slot !== 'third') return home;
    var v = {}, st = h.kits[slot] || {};
    Object.keys(SLOT_DEF[slot]).forEach(function (k) { v[k] = st[k] != null ? st[k] : SLOT_DEF[slot][k]; });
    OWN_KEYS.forEach(function (k) { v[k] = home[k]; });
    return v;
  }
  function current() { get(); return view(S.kitUse, S); }
  function viewOf(p) { p = p || {}; var h = { kit: Object.assign({}, p.kit), kits: { away: Object.assign({}, p.kits && p.kits.away), third: Object.assign({}, p.kits && p.kits.third) }, kitUse: p.kitUse }; prep(h); return Object.assign({}, view(h.kitUse, h)); }
  // a saved-shape kit (S.kit, a slot from People.kitOf with _slot, or {}) as a full kit
  function fill(k) {
    k = k && typeof k === 'object' ? k : {};
    var out = defaults(), slot = k._slot;
    if (slot === 'away' || slot === 'third') Object.assign(out, SLOT_DEF[slot]);
    Object.keys(k).forEach(function (key) { if (key !== '_slot' && k[key] != null) out[key] = k[key]; });
    return out;
  }
  var editing = null;                          // the slot shown in the panel
  function slotNow() { return editing || (prep(hold()), hold().kitUse) || 'home'; }
  function store() { if (!who) persist(); else if (who.save) who.save(); }
  // what the person wears now: 'kit' (the football kit) or one of People.OUTFITS
  function avatarNow() { return window.People ? (who ? People.clean(who.h.avatar) : People.own()) : null; }
  function outfitNow() { var a = avatarNow(); return a && a.outfit ? a.outfit : 'kit'; }
  function skinNow() { var a = who ? who.h.avatar : (window.People ? People.own() : null); return (a && a.skin) || '#efc19d'; }
  function backNow() {
    if (who) return String(who.h.back != null && who.h.back !== '' ? who.h.back : (who.h.name || '')).toUpperCase().slice(0, 12);
    if (window.Avatar && Avatar.printedBack) return Avatar.printedBack(S.name, S.backName == null ? 'TYSON W.' : S.backName);   // placeholders follow the name
    return String(typeof backName === 'function' ? backName() : (S.name || '')).toUpperCase().slice(0, 12);
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
    else h += '<path d="M84 10 L100 40 L116 10 Z" fill="' + skinNow() + '"/><path d="M82 9 L100 44 L118 9" fill="none" stroke="' + k.trim + '" stroke-width="7" stroke-linejoin="miter"/><path d="M83 9 L100 41 L117 9" fill="none" stroke="' + t2 + '" stroke-width="1.4"/>';
    // cuffs
    h += long ? '<path d="M22 150 L40 152 M160 152 L178 150" stroke="' + k.trim + '" stroke-width="6" stroke-linecap="round"/>'
      : '<path d="M18 46 L36 78 M182 46 L164 78" stroke="' + k.trim + '" stroke-width="6" stroke-linecap="round"/>';
    if (k.armband) h += long ? '<path d="M172 70 L152 76" stroke="' + k.armbandCol + '" stroke-width="9"/>' : '<path d="M176 56 L160 72" stroke="' + k.armbandCol + '" stroke-width="8"/>';
    var art = window.KitArt;
    if (back) {
      h += '<text x="100" y="128" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="62" fill="' + acc + '" stroke="' + (lum(k.shirt) > 0.55 ? '#ffffff' : k.trim) + '" stroke-width="3" paint-order="stroke">' + esc(num) + '</text>' +
        '<text x="100" y="62" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="15" fill="' + acc + '">' + esc(backNow()) + '</text>';
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
    if (window.People) {                                  // the right person: their avatar (and, for someone else, their name and number)
      var av = who ? People.clean(who.h.avatar) : People.own(); o.avatar = Object.assign({}, av, { outfit: 'kit' });   // the kit is what is being designed
      if (who) { o.name = backNow(); o.number = String(who.h.jersey || '7'); o.kit.hair = av.hair; if (['swept', 'short', 'spiky', 'curly', 'long'].indexOf(av.hairStyle) >= 0) o.kit.hairStyle = av.hairStyle; }
    }
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
    var hd = hold(), home = prep(hd), slot = slotNow(), k = view(slot), num = String(hd.jersey || '7'), pv = has3D(), use = hd.kitUse;
    var title = who && who.title ? esc(who.title) : 'My kit';
    var h = '<h2 class="hero">' + (typeof ico === 'function' ? ico('star') : '') + ' ' + title + '</h2>';
    var fit = outfitNow();
    if (fit !== 'kit') {                          // wearing everyday clothes: this designs the kit they own, one tap puts it on
      var nm = '';
      if (window.People) People.OUTFITS.forEach(function (o) { if (o[0] === fit) nm = o[1]; });
      h += '<div class="kit-wearing" role="status"><p>' + (who ? esc(String(who.h.name || 'This player')) + ' is' : 'You are') + ' wearing ' + (nm ? 'the ' + esc(nm.toLowerCase()) : 'other clothes') + ' right now, not the football kit.</p>' +
        '<button class="btn small green" data-act="kitPutOn">Wear the football kit</button></div>';
    }
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
    } else modal(html(), function () { if (box) box.classList.remove('kit-modal'); editing = null; who = null; var d = doneCb; doneCb = null; if (d) d(); });
    box = document.getElementById('modalBox'); if (box) box.classList.add('kit-modal');
    var inp = document.getElementById('kitNumber');
    if (inp) inp.addEventListener('change', function () { setNum(inp.value); });
    preview();
  }
  function setNum(v) {
    var n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); if (!(n >= 1)) n = 1; if (n > 99) n = 99;
    hold().jersey = String(n); store(); changed();
  }
  function changed() { if (!who && typeof T3 !== 'undefined' && T3.playerRefresh) T3.playerRefresh(); render(); }
  // target: nothing / { kind: 'own' } = the save's own kits; { kind: 'crew', id }; { kind: 'draft', person } (see the top)
  var doneCb = null, lastWho = 'own';
  function open(target) {
    var t = target && typeof target === 'object' ? target : null;
    who = null; doneCb = t && typeof t.onDone === 'function' ? t.onDone : null;
    if (t && t.kind === 'crew' && window.People) {
      var m = People.member(t.id); if (!m) { if (doneCb) { var d = doneCb; doneCb = null; d(); } return; }
      who = { h: m, title: m.name + "'s kit", save: function () { People.saveMember(who.h); persist(); } };
    } else if (t && t.kind === 'draft' && t.person) {
      who = { h: t.person, title: t.title || (t.person.name ? String(t.person.name) + "'s kit" : 'My kit'), save: null };
    }
    var key = who ? (t.kind + (t.id || '')) : 'own';
    if (key !== lastWho || who) shots = { front: null, back: null };   // never show someone else's picture
    lastWho = key;
    prep(hold()); editing = hold().kitUse; render();
  }
  function pop() { if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop(); }

  ACT.openKit = function () { pop(); open(); };
  ACT.kitSlot = function (el) { var s = el.dataset.arg; if (s !== 'home' && s !== 'away' && s !== 'third') return; editing = s; shots = { front: null, back: null }; pop(); render(); };
  ACT.kitWear = function () { prep(hold()); hold().kitUse = slotNow(); store(); if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); changed(); };
  ACT.kitPick = function (el) {
    var home = prep(hold()), key = el.dataset.k, v = el.dataset.arg, slot = slotNow();
    if (KIT_KEYS.indexOf(key) < 0 && OWN_KEYS.indexOf(key) < 0) return;
    if (key === 'frontNum' || key === 'gloves' || key === 'armband') v = v === 'on';
    if (key === 'armbandCol') home.armband = true;
    if (OWN_KEYS.indexOf(key) >= 0 || slot === 'home') home[key] = v;
    else hold().kits[slot][key] = v;
    store(); pop(); changed();
  };
  ACT.kitNum = function (el) { var n = (parseInt(hold().jersey, 10) || 7) + (+el.dataset.arg || 0); if (n < 1) n = 99; if (n > 99) n = 1; setNum(n); };
  ACT.kitLocked = function (el) {
    var c = find(el.dataset.arg); if (typeof Snd !== 'undefined' && Snd.boop) Snd.boop();
    var note = document.querySelector('.kit-note'); if (note && c) note.textContent = c.name + ': ' + lockText(c) + ' to unlock it.';
  };
  // reset the kit being edited to its defaults (his own things - hair, boots, armband, gloves, celebration - stay)
  ACT.kitReset = function () {
    var home = prep(hold()), slot = slotNow();
    if (slot === 'home') { var d = defaults(); KIT_KEYS.forEach(function (k) { if (d[k] != null) home[k] = d[k]; else delete home[k]; }); }
    else hold().kits[slot] = {};
    store(); changed();
  };
  // put the football kit back on (the outfit's clothes and colours stay saved in the avatar for later)
  ACT.kitPutOn = function () {
    if (!window.People) return;
    var a = avatarNow(); if (!a) return;
    a.outfit = 'kit'; a.at = Date.now();
    if (who) { who.h.avatar = a; store(); }
    else { S.avatar = a; persist(); }
    if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime();
    changed();
  };
  ACT.kitDone = function () { if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); closeModal(); };

  return { get: get, current: current, open: function (t) { open(t); }, fill: fill, viewOf: viewOf, defaults: defaults, celebOpen: celebOpen, celebration: celebration,
    celebrations: function () { return CELEB.map(function (c) { return { id: c.id, name: c.name, open: celebOpen(c), lock: celebOpen(c) ? '' : lockText(c) }; }); } };
})();
