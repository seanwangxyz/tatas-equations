'use strict';
// ======================= PEOPLE: what a human player looks like =======================
// One shared description of a person (the "avatar") used by the avatar maker (js/avatar.js), the 3D figures
// (js/three/creatures/people.js, js/three/player.js), the players list for games on one device, and online play.
// Plain data and small pure helpers only: no DOM, no 3D. Loads as a classic script (global People) and in node.
//
// AN AVATAR (every field optional; People.clean() fills the rest and throws away anything not allowed):
//   { v: 1,
//     body:      one of BODIES ids       'kid-s' little kid | 'kid' | 'teen' big kid | 'adult-a' slimmer | 'adult-b' broader
//     height:    -1 | 0 | 1              shorter / middle / taller for that body
//     skin:      '#rrggbb'               (SKINS is the palette the maker offers; any hex is accepted)
//     hair:      '#rrggbb'               (HAIR_COLORS)
//     hairStyle: one of HAIR_STYLES ids
//     eyes:      '#rrggbb'               (EYES)
//     glasses:   'none' | 'round' | 'square'      glassCol: '#rrggbb' (GLASS_COLORS)
//     beard:     'none' | 'stubble' | 'moustache' | 'goatee' | 'beard'     (drawn in the hair colour)
//     freckles:  bool     lashes: bool (longer eyelashes)     cheeks: bool (rosy cheeks; default true)
//     gems:      bool                    a few tiny sparkly face gems under the eyes
//     streaks:   'none' | '#rrggbb'      coloured streaks / highlights in the hair (HAIR_COLORS)
//     acc:       one of ACCS ids         accCol: '#rrggbb' (ACC_COLORS)      a hair bow, a headband, butterfly clips,
//                                        a scrunchie (on a ponytail, bun or pigtails; a wrist scrunchie otherwise), a cap
//     at:        ms timestamp of the last change (cloud merge: the newest wins) }
//
// IN THE SAVE:
//   S.avatar           this save's own player (absent on old saves: People.own() then builds it from S.set.me and S.kit)
//   S.crew             up to MAX_CREW other people who play on this device (family and friends), each:
//                        { id: 'c' + n, name, jersey: '1'..'99', back: name on the shirt (optional), avatar: {...},
//                          kit: {...}, kits: { away: {...}, third: {...} }, kitUse: 'home' | 'away' | 'third', at }
//                      the kit fields have exactly the shape of S.kit / S.kits / S.kitUse (see js/kit.js), so the kit
//                      designer can edit a crew member the same way it edits the save's own kit.
//   S.crewGone         { id: when removed }   (so a removed player stays removed after a cloud merge)
//
// ONLINE: People.pack(avatar) is a short string of letters, digits and dots (at most 120 characters) that
// People.unpack() turns back into a clean avatar; it travels inside the existing kit text, so no server rule changes.
var People = (function () {
  var BODIES = [['kid-s', 'Little kid', 'about 5 to 7'], ['kid', 'Kid', 'about 8 to 10'], ['teen', 'Big kid', 'about 11 to 15'],
    ['adult-a', 'Grown-up', 'slimmer build'], ['adult-b', 'Grown-up', 'broader build']];
  var HEIGHTS = [[-1, 'Shorter'], [0, 'Middle'], [1, 'Taller']];
  var SKINS = [['#fbe3d0', 'Tone 1'], ['#f6d3b8', 'Tone 2'], ['#efc19d', 'Tone 3'], ['#e4b48e', 'Tone 4'], ['#d9a273', 'Tone 5'],
    ['#c68a5c', 'Tone 6'], ['#a86e45', 'Tone 7'], ['#8a5533', 'Tone 8'], ['#6b3f25', 'Tone 9'], ['#4a2a18', 'Tone 10']];
  var HAIR_COLORS = [['#15110e', 'Black'], ['#3b2314', 'Dark brown'], ['#5a3a22', 'Brown'], ['#7b5536', 'Light brown'], ['#a8824a', 'Dark blonde'],
    ['#d9a441', 'Golden'], ['#ecd28a', 'Blonde'], ['#b5562a', 'Ginger'], ['#7a3320', 'Auburn'], ['#9a9a9a', 'Grey'], ['#d5d5d5', 'Silver'], ['#f1efe9', 'White'],
    ['#3b82f6', 'Blue'], ['#e64980', 'Pink'], ['#7048e8', 'Purple'], ['#2f9e44', 'Green']];
  var HAIR_STYLES = [['swept', 'Swept fringe'], ['short', 'Short'], ['spiky', 'Spiky'], ['curly', 'Curly'], ['long', 'Long'], ['tousled', 'Tousled'],
    ['buzz', 'Buzz cut'], ['side', 'Side part'], ['thin', 'Thin on top'], ['bald', 'No hair'], ['coils', 'Short coils'], ['afro', 'Afro'],
    ['bob', 'Bob'], ['wavy', 'Long wavy'], ['ponytail', 'Ponytail'], ['pigtails', 'Pigtails'], ['braids', 'Two braids'], ['bun', 'Bun'],
    ['highpony', 'High ponytail'], ['spacebuns', 'Space buns'], ['halfup', 'Half up'], ['curtain', 'Long with curtain bangs']];
  var EYES = [['#2e1c10', 'Dark brown'], ['#3f2412', 'Brown'], ['#6b4423', 'Light brown'], ['#7a6a3a', 'Hazel'], ['#4f7a4a', 'Green'], ['#3d6fa8', 'Blue'], ['#6f8796', 'Grey']];
  var GLASSES = [['none', 'None'], ['round', 'Round'], ['square', 'Square']];
  var GLASS_COLORS = [['#25262b', 'Black'], ['#6b4423', 'Brown'], ['#c9342c', 'Red'], ['#1c7ed6', 'Blue'], ['#d4a72c', 'Gold']];
  var BEARDS = [['none', 'None'], ['stubble', 'Stubble'], ['moustache', 'Moustache'], ['goatee', 'Goatee'], ['beard', 'Full beard']];
  var ACCS = [['none', 'None'], ['bow', 'Hair bow'], ['band', 'Headband'], ['clips', 'Butterfly clips'], ['scrunchie', 'Scrunchie'], ['cap', 'Cap']];
  var ACC_COLORS = [['#e64980', 'Pink'], ['#c9342c', 'Red'], ['#f5c518', 'Yellow'], ['#2f9e44', 'Green'], ['#1c7ed6', 'Blue'], ['#7048e8', 'Purple'], ['#f1f3f5', 'White'], ['#25262b', 'Black']];
  var MAX_CREW = 8;

  // the two looks the game has always had: the kid (Tyson's footballer) and the grown-up ("Tata")
  var DEFAULT = { v: 1, body: 'kid', height: 0, skin: '#efc19d', hair: '#3b2314', hairStyle: 'swept', eyes: '#3f2412', glasses: 'none', glassCol: '#25262b',
    beard: 'none', freckles: false, lashes: false, cheeks: true, gems: false, streaks: 'none', acc: 'none', accCol: '#e64980' };
  var GROWN = { v: 1, body: 'adult-b', height: 0, skin: '#e4b48e', hair: '#17130f', hairStyle: 'tousled', eyes: '#2e1c10', glasses: 'none', glassCol: '#25262b',
    beard: 'stubble', freckles: false, lashes: false, cheeks: true, gems: false, streaks: 'none', acc: 'none', accCol: '#e64980' };

  var HEX = /^#[0-9a-fA-F]{6}$/;
  function ids(list) { return list.map(function (x) { return x[0]; }); }
  function oneOf(v, list, d) { return ids(list).indexOf(v) >= 0 ? v : d; }
  function hex(v, d) { return typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d; }
  function flag(v, d) { return v === true || v === 'on' ? true : v === false || v === 'off' ? false : d; }
  function isAdult(a) { var b = a && a.body; return b === 'adult-a' || b === 'adult-b'; }
  // a full, safe avatar from anything (a saved object, a network message, nothing at all)
  function clean(a, base) {
    a = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
    var d = base || (isAdult(a) ? GROWN : DEFAULT), h = +a.height;
    var out = { v: 1, body: oneOf(a.body, BODIES, d.body), height: h === -1 || h === 1 ? h : 0, skin: hex(a.skin, d.skin), hair: hex(a.hair, d.hair),
      hairStyle: oneOf(a.hairStyle, HAIR_STYLES, d.hairStyle), eyes: hex(a.eyes, d.eyes), glasses: oneOf(a.glasses, GLASSES, d.glasses), glassCol: hex(a.glassCol, d.glassCol),
      beard: oneOf(a.beard, BEARDS, a.beard == null ? d.beard : 'none'), freckles: flag(a.freckles, d.freckles), lashes: flag(a.lashes, d.lashes), cheeks: flag(a.cheeks, d.cheeks),
      gems: flag(a.gems, d.gems), streaks: a.streaks === 'none' ? 'none' : hex(a.streaks, d.streaks),
      acc: oneOf(a.acc, ACCS, d.acc), accCol: hex(a.accCol, d.accCol) };
    if (typeof a.at === 'number' && isFinite(a.at)) out.at = a.at;
    return out;
  }
  function theSave(s) { return s || (typeof S !== 'undefined' && S ? S : {}); }
  // this save's own player. Old saves have no S.avatar: the kid (or the grown-up, if Settings says so) with the hair
  // that used to live in the kit (S.kit.hair / S.kit.hairStyle).
  function own(s) {
    s = theSave(s);
    if (s.avatar && typeof s.avatar === 'object') return clean(s.avatar);
    var grown = !!(s.set && s.set.me === 'tata'), k = s.kit || {}, a = Object.assign({}, grown ? GROWN : DEFAULT);
    if (!grown) { if (k.hair) a.hair = k.hair; if (k.hairStyle) a.hairStyle = k.hairStyle; }
    return clean(a);
  }
  // ----- the other people on this device -----
  function cleanName(n, d) { n = String(n == null ? '' : n).replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12); return n || d || 'Player'; }
  function cleanJersey(j, d) { j = String(j == null ? '' : j).replace(/[^0-9]/g, '').slice(0, 2); return j || d || '7'; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function cleanMember(m, i) {
    m = obj(m);
    var kits = obj(m.kits);
    return { id: typeof m.id === 'string' && /^c[0-9]{1,6}$/.test(m.id) ? m.id : 'c' + (i + 1), name: cleanName(m.name, 'Player ' + (i + 1)), jersey: cleanJersey(m.jersey, String(8 + i)),
      back: m.back == null ? null : cleanName(m.back, null), avatar: clean(m.avatar), kit: obj(m.kit), kits: { away: obj(kits.away), third: obj(kits.third) },
      kitUse: m.kitUse === 'away' || m.kitUse === 'third' ? m.kitUse : 'home', at: typeof m.at === 'number' && isFinite(m.at) ? m.at : 0 };
  }
  function crew(s) {
    s = theSave(s);
    var seen = {}, out = [];
    (Array.isArray(s.crew) ? s.crew : []).forEach(function (m, i) { var c = cleanMember(m, i); if (seen[c.id] || out.length >= MAX_CREW) return; seen[c.id] = 1; out.push(c); });
    return out;
  }
  function member(id, s) { var list = crew(s); for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  // a new id: random, so two devices that each add a player while apart do not pick the same one
  function newId(s) { var have = {}, id; crew(s).forEach(function (m) { have[m.id] = 1; }); do { id = 'c' + (10000 + Math.floor(Math.random() * 90000)); } while (have[id]); return id; }
  // add or replace one member in S.crew (the caller persists). Returns the cleaned member, or null if the list is full.
  function saveMember(m, s) {
    s = theSave(s);
    var list = crew(s), c = cleanMember(Object.assign({}, m, { id: m && m.id ? m.id : newId(s) }), list.length), k = -1;
    list.forEach(function (x, i) { if (x.id === c.id) k = i; });
    if (k < 0 && list.length >= MAX_CREW) return null;
    c.at = Date.now(); c.avatar.at = c.at;
    if (k < 0) list.push(c); else list[k] = c;
    s.crew = list;
    return c;
  }
  // remove one member; S.crewGone remembers when, so the cloud copy of that player does not bring them back
  function removeMember(id, s) {
    s = theSave(s); s.crew = crew(s).filter(function (m) { return m.id !== id; });
    if (!s.crewGone || typeof s.crewGone !== 'object') s.crewGone = {};
    s.crewGone[id] = Date.now();
  }
  // the name printed on the back of a member's shirt
  function backOf(m) { return String(m.back != null && m.back !== '' ? m.back : m.name).toUpperCase().slice(0, 12); }
  // the kit a member wears now, in the saved shape (like savedKit() in js/three/creatures/kid.js, without its defaults)
  function kitOf(m) {
    m = obj(m);
    var home = obj(m.kit), use = m.kitUse;
    if (use !== 'away' && use !== 'third') return Object.assign({}, home);
    var slot = Object.assign({ _slot: use }, obj(obj(m.kits)[use]));
    ['celebrate', 'boots', 'gloves', 'armband', 'armbandCol'].forEach(function (k) { if (home[k] != null) slot[k] = home[k]; });
    return slot;
  }
  // ----- online: a short text form -----
  var ORDER = ['body', 'height', 'skin', 'hair', 'hairStyle', 'eyes', 'glasses', 'glassCol', 'beard', 'freckles', 'lashes', 'cheeks', 'acc', 'accCol', 'gems', 'streaks'];
  function pack(a) {
    a = clean(a);
    return ORDER.map(function (k) { var v = a[k]; return typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(v + 1) : String(v).replace('#', '').replace('-', ''); }).join('.');
  }
  function unpack(str) {
    if (typeof str !== 'string' || str.length > 120 || !/^[a-zA-Z0-9.]+$/.test(str)) return null;
    var p = str.split('.'); if (p.length !== ORDER.length) return null;
    var a = {};
    ORDER.forEach(function (k, i) {
      var v = p[i];
      if (k === 'body') a.body = v.replace(/^(kid|adult)(.)$/, '$1-$2');
      else if (k === 'height') a.height = v === '0' ? -1 : v === '2' ? 1 : 0;
      else if (k === 'freckles' || k === 'lashes' || k === 'cheeks' || k === 'gems') a[k] = v === '1';
      else if (k === 'streaks') a.streaks = v === 'none' ? 'none' : '#' + v;
      else if (k === 'skin' || k === 'hair' || k === 'eyes' || k === 'glassCol' || k === 'accCol') a[k] = '#' + v;
      else a[k] = v;
    });
    return clean(a);
  }
  return { BODIES: BODIES, HEIGHTS: HEIGHTS, SKINS: SKINS, HAIR_COLORS: HAIR_COLORS, HAIR_STYLES: HAIR_STYLES, EYES: EYES, GLASSES: GLASSES, GLASS_COLORS: GLASS_COLORS,
    BEARDS: BEARDS, ACCS: ACCS, ACC_COLORS: ACC_COLORS, MAX_CREW: MAX_CREW, DEFAULT: DEFAULT, GROWN: GROWN,
    clean: clean, isAdult: isAdult, own: own, crew: crew, member: member, newId: newId, saveMember: saveMember, removeMember: removeMember, cleanMember: cleanMember,
    cleanName: cleanName, cleanJersey: cleanJersey, backOf: backOf, kitOf: kitOf, pack: pack, unpack: unpack };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = People;
