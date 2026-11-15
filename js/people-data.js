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
//     outfit:    one of OUTFITS ids      what they wear: 'kit' = the football kit from the kit designer (S.kit ...);
//                                        the others are everyday clothes drawn from the fields below (the kit is kept, just not worn)
//     bottom:    one of BOTTOMS ids      (not used with the football kit)
//     shoes:     one of SHOES ids        (the football kit always wears its boots)
//     fit1 / fit2 / fit3 / shoeCol: '#rrggbb'   the top's main colour, its second colour (sleeves, trim, tie), the
//                                        bottoms, the shoes (FIT_COLORS is the palette the maker offers)
//     at:        ms timestamp of the last change (cloud merge: the newest wins) }
//
// STARTERS: ready-made looks to begin from (a new player picks one picture, then changes anything). Each is
//   { id, name, avatar: {...}, kit: {...saved-shape kit keys}, jersey }. Nobody is asked whether they are a boy or a girl:
//   the pictures show football kits and everyday outfits, and anyone can pick any of them.
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
  // what they wear. 'kit' is the football kit; the rest are everyday clothes (all modest, all for any player)
  var OUTFITS = [['kit', 'Football kit'], ['school', 'School look'], ['cardigan', 'Cardigan'], ['hoodie', 'Hoodie'], ['varsity', 'Varsity jacket'], ['tee', 'Big T-shirt']];
  var BOTTOMS = [['shorts', 'Shorts'], ['skirt', 'Pleated skirt'], ['cargos', 'Cargo trousers'], ['jeans', 'Wide jeans'], ['joggers', 'Joggers']];
  var SHOES = [['sneakers', 'Trainers'], ['hightops', 'High-tops'], ['loafers', 'School shoes'], ['boots', 'Football boots']];
  var FIT_COLORS = [['#f1f3f5', 'White'], ['#25262b', 'Black'], ['#868e96', 'Grey'], ['#1f3a68', 'Navy'], ['#1c7ed6', 'Blue'], ['#a5d8ff', 'Baby blue'], ['#2f9e44', 'Green'], ['#b2f2bb', 'Mint'],
    ['#c9342c', 'Red'], ['#f783ac', 'Pink'], ['#ffdeeb', 'Blush'], ['#b197fc', 'Lilac'], ['#7048e8', 'Purple'], ['#f5c518', 'Yellow'], ['#f76707', 'Orange'], ['#d9c2a0', 'Sand'], ['#7b5536', 'Brown']];
  var MAX_CREW = 8;

  // the two looks the game has always had: the kid (Tyson's footballer) and the grown-up ("Tata")
  var DEFAULT = { v: 1, body: 'kid', height: 0, skin: '#efc19d', hair: '#3b2314', hairStyle: 'swept', eyes: '#3f2412', glasses: 'none', glassCol: '#25262b',
    beard: 'none', freckles: false, lashes: false, cheeks: true, gems: false, streaks: 'none', acc: 'none', accCol: '#e64980',
    outfit: 'kit', bottom: 'shorts', shoes: 'sneakers', fit1: '#1c7ed6', fit2: '#f1f3f5', fit3: '#1f3a68', shoeCol: '#f1f3f5' };
  var GROWN = { v: 1, body: 'adult-b', height: 0, skin: '#e4b48e', hair: '#17130f', hairStyle: 'tousled', eyes: '#2e1c10', glasses: 'none', glassCol: '#25262b',
    beard: 'stubble', freckles: false, lashes: false, cheeks: true, gems: false, streaks: 'none', acc: 'none', accCol: '#e64980',
    outfit: 'kit', bottom: 'shorts', shoes: 'sneakers', fit1: '#1c7ed6', fit2: '#f1f3f5', fit3: '#1f3a68', shoeCol: '#f1f3f5' };

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
      beard: oneOf(a.beard, BEARDS, 'none'), freckles: flag(a.freckles, d.freckles), lashes: flag(a.lashes, d.lashes), cheeks: flag(a.cheeks, d.cheeks),
      gems: flag(a.gems, d.gems), streaks: a.streaks === 'none' ? 'none' : hex(a.streaks, d.streaks),
      acc: oneOf(a.acc, ACCS, d.acc), accCol: hex(a.accCol, d.accCol),
      outfit: oneOf(a.outfit, OUTFITS, d.outfit), bottom: oneOf(a.bottom, BOTTOMS, d.bottom), shoes: oneOf(a.shoes, SHOES, d.shoes),
      fit1: hex(a.fit1, d.fit1), fit2: hex(a.fit2, d.fit2), fit3: hex(a.fit3, d.fit3), shoeCol: hex(a.shoeCol, d.shoeCol) };
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
  var ORDER = ['body', 'height', 'skin', 'hair', 'hairStyle', 'eyes', 'glasses', 'glassCol', 'beard', 'freckles', 'lashes', 'cheeks', 'acc', 'accCol', 'gems', 'streaks',
    'outfit', 'bottom', 'shoes', 'fit1', 'fit2', 'fit3', 'shoeCol'];
  var OLD_N = 16, COLS = { skin: 1, hair: 1, eyes: 1, glassCol: 1, accCol: 1, fit1: 1, fit2: 1, fit3: 1, shoeCol: 1 };   // (text from before the outfits has 16 parts: still read)
  function pack(a) {
    a = clean(a);
    return ORDER.map(function (k) { var v = a[k]; return typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(v + 1) : String(v).replace('#', '').replace('-', ''); }).join('.');
  }
  function unpack(str) {
    if (typeof str !== 'string' || str.length > 170 || !/^[a-zA-Z0-9.]+$/.test(str)) return null;
    var p = str.split('.'); if (p.length !== ORDER.length && p.length !== OLD_N) return null;
    var a = {};
    ORDER.forEach(function (k, i) {
      var v = p[i]; if (v === undefined) return;
      if (k === 'body') a.body = v.replace(/^(kid|adult)(.)$/, '$1-$2');
      else if (k === 'height') a.height = v === '0' ? -1 : v === '2' ? 1 : 0;
      else if (k === 'freckles' || k === 'lashes' || k === 'cheeks' || k === 'gems') a[k] = v === '1';
      else if (k === 'streaks') a.streaks = v === 'none' ? 'none' : '#' + v;
      else if (COLS[k]) a[k] = '#' + v;
      else a[k] = v;
    });
    return clean(a);
  }
  // ----- ready-made looks to begin from -----
  var STARTERS = [
    { id: 'kit-blue', name: 'Blue kit', jersey: '10', avatar: { body: 'kid', hairStyle: 'short', hair: '#15110e', skin: '#d9a273', outfit: 'kit' },
      kit: { shirt: '#1c7ed6', pattern: 'plain', trim: '#ffffff', shorts: '#ffffff', crest: 'star', mark: 'bolt', numStyle: 'block', collar: 'round', boots: '#f8f9fa' } },
    { id: 'kit-green', name: 'Green hoops', jersey: '8', avatar: { body: 'kid', hairStyle: 'spiky', hair: '#b5562a', skin: '#fbe3d0', freckles: true, outfit: 'kit' },
      kit: { shirt: '#2f9e44', pattern: 'hoops', trim: '#ffffff', shorts: '#ffffff', crest: 'dice', mark: 'fox', numStyle: 'round', collar: 'round', boots: '#1f2430' } },
    { id: 'kit-purple', name: 'Purple and gold', jersey: '11', avatar: { body: 'kid', hairStyle: 'highpony', hair: '#3b2314', skin: '#e4b48e', lashes: true, acc: 'scrunchie', accCol: '#f5c518', outfit: 'kit' },
      kit: { shirt: '#7048e8', pattern: 'sash', trim: '#ffd43b', shorts: '#25262b', crest: 'diamond', mark: 'rocket', numStyle: 'college', collar: 'v', boots: '#f5c518' } },
    { id: 'kit-pink', name: 'Pink and white', jersey: '7', avatar: { body: 'kid', hairStyle: 'braids', hair: '#15110e', skin: '#8a5533', lashes: true, outfit: 'kit' },
      kit: { shirt: '#e64980', pattern: 'stripes', trim: '#ffffff', shorts: '#ffffff', crest: 'ribbon', mark: 'swift', numStyle: 'thin', collar: 'v', boots: '#f8f9fa' } },
    { id: 'school', name: 'School look', jersey: '5', avatar: { body: 'teen', hairStyle: 'halfup', hair: '#5a3a22', skin: '#f6d3b8', lashes: true, acc: 'bow', accCol: '#1f3a68',
      outfit: 'school', bottom: 'skirt', shoes: 'loafers', fit1: '#1f3a68', fit2: '#c9342c', fit3: '#868e96', shoeCol: '#25262b' }, kit: { shirt: '#f1f3f5', pattern: 'plain', trim: '#1f3a68', shorts: '#1f3a68', crest: 'roundel', mark: 'swift', numStyle: 'thin', collar: 'v', boots: '#1f2430' } },
    { id: 'cardigan', name: 'Soft cardigan', jersey: '3', avatar: { body: 'kid', hairStyle: 'spacebuns', hair: '#7b5536', skin: '#efc19d', lashes: true, gems: true, acc: 'clips', accCol: '#b197fc',
      outfit: 'cardigan', bottom: 'skirt', shoes: 'sneakers', fit1: '#ffdeeb', fit2: '#f1f3f5', fit3: '#b197fc', shoeCol: '#f1f3f5' }, kit: { shirt: '#e64980', pattern: 'hoops', trim: '#ffffff', shorts: '#7048e8', crest: 'star', mark: 'pip', numStyle: 'round', collar: 'round', boots: '#f8f9fa' } },
    { id: 'hoodie', name: 'Big hoodie', jersey: '21', avatar: { body: 'teen', hairStyle: 'curtain', hair: '#15110e', skin: '#c68a5c', lashes: true, streaks: '#b197fc',
      outfit: 'hoodie', bottom: 'cargos', shoes: 'hightops', fit1: '#b197fc', fit2: '#f1f3f5', fit3: '#d9c2a0', shoeCol: '#f1f3f5' }, kit: { shirt: '#7048e8', pattern: 'waves', trim: '#ffffff', shorts: '#25262b', crest: 'diamond', mark: 'bolt', numStyle: 'outline', collar: 'round', boots: '#f8f9fa' } },
    { id: 'varsity', name: 'Varsity jacket', jersey: '23', avatar: { body: 'teen', hairStyle: 'side', hair: '#3b2314', skin: '#e4b48e',
      outfit: 'varsity', bottom: 'jeans', shoes: 'sneakers', fit1: '#2f9e44', fit2: '#f1f3f5', fit3: '#1c7ed6', shoeCol: '#f1f3f5' }, kit: { shirt: '#2f9e44', pattern: 'sash', trim: '#ffffff', shorts: '#1f3a68', crest: 'dice', mark: 'fox', numStyle: 'college', collar: 'v', boots: '#1f2430' } },
    { id: 'tee', name: 'Big T-shirt', jersey: '14', avatar: { body: 'kid', hairStyle: 'coils', hair: '#15110e', skin: '#6b3f25',
      outfit: 'tee', bottom: 'joggers', shoes: 'hightops', fit1: '#f5c518', fit2: '#25262b', fit3: '#25262b', shoeCol: '#c9342c' }, kit: { shirt: '#f5c518', pattern: 'stripes', trim: '#25262b', shorts: '#25262b', crest: 'ribbon', mark: 'rocket', numStyle: 'block', collar: 'round', boots: '#c9342c' } },
    { id: 'classic', name: 'Red classic', jersey: '7', avatar: { body: 'kid', hairStyle: 'swept', outfit: 'kit' }, kit: {} }
  ];
  function starter(id) { for (var i = 0; i < STARTERS.length; i++) if (STARTERS[i].id === id) return STARTERS[i]; return null; }
  // A brand-new save (nobody has played or named it) starts as its own player, not as the owner's son: one of the
  // football-kit starters at random (never the red classic), 'PLAYER' on the back. The caller persists. Returns
  // the starter used, or null when the save is not brand new (then nothing is touched).
  function isBrandNew(s) { s = theSave(s); return !s.avatar && !s.avatarAsked && !s.freshDone && (s.name === 'Champ' || !s.name) && !(s.xp > 0) && !(s.stats && (s.stats.shakes > 0 || s.stats.correct > 0)); }
  function freshStart(s, rnd) {
    s = theSave(s); if (!isBrandNew(s)) return null;
    var list = STARTERS.filter(function (x) { return x.id.indexOf('kit-') === 0; }), st = list[Math.floor((rnd == null ? Math.random() : rnd) * list.length) % list.length];
    s.kit = Object.assign({}, obj(s.kit), st.kit); s.jersey = st.jersey; s.backName = 'PLAYER'; s.freshDone = true;
    return st;
  }
  return { BODIES: BODIES, HEIGHTS: HEIGHTS, SKINS: SKINS, HAIR_COLORS: HAIR_COLORS, HAIR_STYLES: HAIR_STYLES, EYES: EYES, GLASSES: GLASSES, GLASS_COLORS: GLASS_COLORS,
    BEARDS: BEARDS, ACCS: ACCS, ACC_COLORS: ACC_COLORS, OUTFITS: OUTFITS, BOTTOMS: BOTTOMS, SHOES: SHOES, FIT_COLORS: FIT_COLORS, STARTERS: STARTERS, starter: starter,
    isBrandNew: isBrandNew, freshStart: freshStart, MAX_CREW: MAX_CREW, DEFAULT: DEFAULT, GROWN: GROWN,
    clean: clean, isAdult: isAdult, own: own, crew: crew, member: member, newId: newId, saveMember: saveMember, removeMember: removeMember, cleanMember: cleanMember,
    cleanName: cleanName, cleanJersey: cleanJersey, backOf: backOf, kitOf: kitOf, pack: pack, unpack: unpack };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = People;
