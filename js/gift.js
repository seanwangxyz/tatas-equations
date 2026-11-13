'use strict';
// ======================= PUZZLE FROM TATA =======================
// A grown-up sets a puzzle (cubes on the table, a Goal, optional Required / Forbidden cubes and a
// short message), the game checks with the solver that it CAN be solved, and turns it into a short
// code that can be read out or texted. The kid types the code on any device (no internet needed),
// solves it with the normal Solution builder, and gets a 4-letter receipt to tell Tata.
// Inert until wired: it only adds ACT.giftOpen (and friends), giftTileHTML() and giftFromHash().
// Renders into <section id="gift"> (made on the fly if index.html doesn't have one yet).
// See docs/handoff/gift.md.

/*GIFT-CODEC-START*/
// ----- The code: pure functions, no screen (unit-tested in tests/engine.test.js) -----
// Alphabet: 32 characters, no 0 / O / 1 / I. Every character carries one 5-bit value.
// Layout (version 1, first character 'T'):
//   [T] [flags] [Goal tokens...] ([26] Required cubes...) ([27] Forbidden cubes...) ([28] Permitted cubes...) [check]
//   cube value 0-23 = colour index * 6 + face index (Eq.COLORS / Eq.CUBE_FACES); 24 = '(' and 25 = ')'
//   (only inside the Goal); 26 / 27 / 28 start the Required / Forbidden / Permitted cubes (each list
//   only if it isn't empty, in that order, cubes sorted). flags: bit 0 = fractions allowed; bits 1-4 must be 0.
//   check = sum over GF(32) of value[i] * a^i (a = x, modulus x^5 + x^2 + 1). It catches every single
//   wrong character and every swap of two neighbouring characters (the code is never longer than 31).
var GiftCode = (function (Eq) {
  var ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var VERSIONS = { T: 1 };            // first character -> version
  var LP = 24, RP = 25, Z_REQ = 26, Z_FORB = 27, Z_PERM = 28;
  var FLAG_FR = 1;
  var MIN_CUBES = 6, MAX_CUBES = 14, MAX_GOAL_TOKENS = 12, MSG_MAX = 60, PER_COLOR = 6;
  var WHY = {
    empty: 'Type the code first.',
    confusable: 'Codes never use 0, O, 1 or I. Look again: it might be a D, Q, L or J, or a 2.',
    badchar: 'Codes only use the letters A to Z and the numbers 2 to 9.',
    short: 'That code looks too short. Check you have every letter.',
    check: 'One letter doesn\'t match. Check the code with Tata and try again.',
    version: 'This code is from a newer version of the game.',
    bad: 'That code doesn\'t make a puzzle I know. Check it with Tata.'
  };

  function gmul(a, b) { var r = 0; for (var i = 0; i < 5; i++) { if (b & 1) r ^= a; b >>= 1; a <<= 1; if (a & 32) a ^= 37; } return r; }
  function checkValue(vals) { var s = 0, w = 1; for (var i = 0; i < vals.length; i++) { s ^= gmul(vals[i], w); w = gmul(w, 2); } return s; }
  function typeOf(c) {
    var ci = Eq.COLORS.indexOf(c.color), fi = ci < 0 ? -1 : Eq.CUBE_FACES[c.color].indexOf(c.s);
    return ci < 0 || fi < 0 ? -1 : ci * 6 + fi;
  }
  function cubeOf(v) { var color = Eq.COLORS[Math.floor(v / 6)]; return { color: color, s: Eq.CUBE_FACES[color][v % 6] }; }
  function sym(t) { return typeof t === 'string' ? t : t.s; }
  function sortCubes(list) { return list.map(function (c) { return { color: c.color, s: c.s }; }).sort(function (a, b) { return typeOf(a) - typeOf(b); }); }
  function goalSyms(goal) { return goal.map(sym); }

  // A puzzle: { fr: bool, goal: [{color,s} | '(' | ')'], req: [{color,s}], forb: [...], perm: [...] }.
  // Returns '' if it is fine, or a sentence saying what is wrong (for the maker's screen).
  function problem(p) {
    if (!p || !Array.isArray(p.goal) || !Array.isArray(p.req) || !Array.isArray(p.forb) || !Array.isArray(p.perm)) return 'Something is missing.';
    var goalCubes = p.goal.filter(function (t) { return typeof t !== 'string'; });
    var all = goalCubes.concat(p.req, p.forb, p.perm), per = {};
    for (var i = 0; i < all.length; i++) { if (typeOf(all[i]) < 0) return 'That isn\'t a real cube face.'; per[all[i].color] = (per[all[i].color] || 0) + 1; }
    for (var k in per) if (per[k] > PER_COLOR) return 'There are only ' + PER_COLOR + ' ' + k + ' cubes in the set.';
    if (all.length < MIN_CUBES) return 'Put at least ' + MIN_CUBES + ' cubes on the table (counting the Goal).';
    if (all.length > MAX_CUBES) return 'Use at most ' + MAX_CUBES + ' cubes (counting the Goal).';
    for (var j = 0; j < p.goal.length; j++) if (typeof p.goal[j] === 'string' && p.goal[j] !== '(' && p.goal[j] !== ')') return 'The Goal has something odd in it.';
    if (!goalCubes.length) return 'Set a Goal first.';
    if (p.goal.length > MAX_GOAL_TOKENS) return 'That Goal has too many ( ). Take some out.';
    var g = Eq.checkGoal(goalSyms(p.goal), !!p.fr);
    if (!g.ok) return 'The Goal isn\'t a legal Goal: ' + g.reasons[0];
    if (p.req.length + p.perm.length < 2) return 'A Solution needs at least 2 cubes, so leave at least 2 cubes Required or Permitted.';
    return '';
  }
  function canonical(p) { return { fr: !!p.fr, goal: p.goal.map(function (t) { return typeof t === 'string' ? t : { color: t.color, s: t.s }; }), req: sortCubes(p.req), forb: sortCubes(p.forb), perm: sortCubes(p.perm) }; }
  // Puzzle -> raw code (no dashes). Throws if the puzzle is not valid (check problem() first).
  function encode(p) {
    var why = problem(p); if (why) throw new Error(why);
    p = canonical(p);
    var vals = [ALPHA.indexOf('T'), p.fr ? FLAG_FR : 0];
    p.goal.forEach(function (t) { vals.push(t === '(' ? LP : t === ')' ? RP : typeOf(t)); });
    [[Z_REQ, p.req], [Z_FORB, p.forb], [Z_PERM, p.perm]].forEach(function (z) {
      if (!z[1].length) return;
      vals.push(z[0]); z[1].forEach(function (c) { vals.push(typeOf(c)); });
    });
    vals.push(checkValue(vals));
    return vals.map(function (v) { return ALPHA[v]; }).join('');
  }
  // Forgiving clean-up: spaces, dashes, dots and lower case are fine.
  function clean(s) { return String(s || '').toUpperCase().replace(/[\s\-_.·–—]/g, ''); }
  // Code (any spelling) -> { ok, p, code (canonical raw) } or { ok:false, why, msg }.
  function decode(str) {
    var s = clean(str);
    function no(w) { return { ok: false, why: w, msg: WHY[w] }; }
    if (!s) return no('empty');
    for (var i = 0; i < s.length; i++) if (ALPHA.indexOf(s[i]) < 0) return no(/[01OI]/.test(s[i]) ? 'confusable' : 'badchar');
    if (s.length < 7) return no('short');
    var vals = s.split('').map(function (ch) { return ALPHA.indexOf(ch); });
    var ck = vals.pop();
    if (checkValue(vals) !== ck) return no('check');
    if (VERSIONS[s[0]] !== 1) return no('version');
    var flags = vals[1];
    if (flags & ~FLAG_FR) return no('version');
    var p = { fr: !!(flags & FLAG_FR), goal: [], req: [], forb: [], perm: [] }, zone = 'goal', last = 0;
    for (var k = 2; k < vals.length; k++) {
      var v = vals[k];
      if (v >= Z_REQ) {
        if (v > Z_PERM || v <= last) return no('bad');
        if (zone !== 'goal' && !p[zone].length) return no('bad');
        last = v; zone = v === Z_REQ ? 'req' : v === Z_FORB ? 'forb' : 'perm';
      } else if (v === LP || v === RP) {
        if (zone !== 'goal') return no('bad');
        p.goal.push(v === LP ? '(' : ')');
      } else if (v < 24) {
        (zone === 'goal' ? p.goal : p[zone]).push(cubeOf(v));
      } else return no('bad');
    }
    if (zone !== 'goal' && !p[zone].length) return no('bad');
    if (problem(p)) return no('bad');
    var raw = encode(p); // canonical spelling (cubes sorted), so the same puzzle always has the same code
    return { ok: true, p: canonical(p), code: raw };
  }
  function pretty(raw) { return clean(raw).replace(/(.{4})(?=.)/g, '$1-'); }
  // ----- Receipt: 4 characters from the code (and how many hints, 0-3+), shown after solving -----
  function fnv(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  function receipt(raw, hints) {
    var h = fnv('R1|' + clean(raw) + '|' + Math.max(0, Math.min(3, hints | 0))), out = '';
    for (var i = 0; i < 4; i++) { out += ALPHA[h & 31]; h = h >>> 5; }
    return out;
  }
  // -> { ok, hints } (hints 3 means "3 or more")
  function checkReceipt(raw, rc) {
    rc = clean(rc);
    for (var h = 0; h <= 3; h++) if (receipt(raw, h) === rc) return { ok: true, hints: h };
    return { ok: false };
  }
  // ----- Message and link -----
  function cleanMsg(m) {
    var s = String(m || '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, MSG_MAX).join('').trim();
  }
  function link(raw, msg, base) {
    msg = cleanMsg(msg);
    return (base || '') + '#puzzle=' + pretty(raw) + (msg ? '&m=' + encodeURIComponent(msg) : '');
  }
  // '#puzzle=TABC-...&m=Hello' -> { code, msg } or null
  function parseHash(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (!/(^|&)puzzle=/.test(h)) return null;
    var out = { code: '', msg: '' };
    h.split('&').forEach(function (part) {
      var i = part.indexOf('='); if (i < 0) return;
      var k = part.slice(0, i), v = part.slice(i + 1);
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { v = ''; }
      if (k === 'puzzle') out.code = v; else if (k === 'm') out.msg = cleanMsg(v);
    });
    return out;
  }
  return { ALPHA: ALPHA, MIN_CUBES: MIN_CUBES, MAX_CUBES: MAX_CUBES, MSG_MAX: MSG_MAX, PER_COLOR: PER_COLOR, MAX_GOAL_TOKENS: MAX_GOAL_TOKENS,
    problem: problem, encode: encode, decode: decode, clean: clean, pretty: pretty, receipt: receipt, checkReceipt: checkReceipt,
    cleanMsg: cleanMsg, link: link, parseHash: parseHash, typeOf: typeOf, checkValue: checkValue };
})(Eq);
/*GIFT-CODEC-END*/

// ======================= Screens =======================
var GIFT = { view: 'hub', from: 'title', M: null, P: null, enterCode: '', enterErr: '' };
var GIFT_XP = { first: 30 };               // bonus the first time a code is solved (plus the normal Solution XP)
var GIFT_CAP = { made: 30, solved: 200 };   // how many puzzles the save remembers

function giftSave() {
  if (!S.gift || typeof S.gift !== 'object') S.gift = { made: [], solved: {} };
  if (!Array.isArray(S.gift.made)) S.gift.made = [];
  if (!S.gift.solved || typeof S.gift.solved !== 'object') S.gift.solved = {};
  return S.gift;
}
function giftSnd(name) { try { if (window.Snd && Snd[name]) Snd[name](); } catch (e) {} }
function giftMood(m) { try { if (window.Snd && Snd.setMood) Snd.setMood(m); } catch (e) {} }
function giftEl() {
  var el = $('#gift');
  if (!el) { el = document.createElement('section'); el.id = 'gift'; el.className = 'screen'; var ref = $('#trophies'); if (ref) ref.parentNode.insertBefore(el, ref); else document.body.appendChild(el); }
  return el;
}
function giftShow() { var el = giftEl(); if (current !== 'gift') go('gift'); return el; }
function giftCoach(text, mood) {
  return '<div class="panel gf-coach" style="background:rgba(255,253,246,.97)"><div class="row">' + pipHTML(mood || 'happy', 70, '') + '<div class="bubble">' + text + '</div></div></div>';
}
function giftHdr(title, back) {
  return '<div class="hdr gf-hdr"><button class="btn small" data-act="' + (back || 'giftBack') + '">' + ico('back') + ' Back</button><h2>' + title + '</h2></div>';
}
function giftCube(c, cls, act, arg) {
  return '<div class="cube mini c-' + c.color + (cls ? ' ' + cls : '') + '"' + (act ? ' data-act="' + act + '" data-arg="' + arg + '" role="button" tabindex="0"' : '') + ' aria-label="' + c.color + ' ' + esc(show(c.s)) + '"><span>' + show(c.s) + '</span></div>';
}
// Puzzle object -> what the screens and the builder use.
function giftTable(p) {
  var cubes = [], goalTokens = [];
  function add(c, zone) { var o = { id: cubes.length, color: c.color, s: c.s, zone: zone, order: cubes.length, locked: false }; cubes.push(o); return o; }
  p.goal.forEach(function (t) { if (typeof t === 'string') goalTokens.push(t); else { var o = add(t, 'goal'); goalTokens.push({ s: o.s, id: o.id }); } });
  function tidy(list) { // digits first, then operations, like the other mats
    return list.slice().sort(function (a, b) { var da = Eq.isDigit(a.s), db = Eq.isDigit(b.s); return da !== db ? (da ? -1 : 1) : Eq.OPS.indexOf(a.s) - Eq.OPS.indexOf(b.s) || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0); });
  }
  tidy(p.req).forEach(function (c) { add(c, 'required'); });
  tidy(p.perm).forEach(function (c) { add(c, 'permitted'); });
  tidy(p.forb).forEach(function (c) { add(c, 'forbidden'); });
  var g = Eq.checkGoal(goalTokens.map(function (t) { return typeof t === 'string' ? t : t.s; }), p.fr);
  return { cubes: cubes, goalTokens: goalTokens, goal: g.ok ? g.value : null, fr: !!p.fr };
}
function giftSyms(cubes, zone) { return cubes.filter(function (c) { return c.zone === zone; }).map(function (c) { return c.s; }); }
function giftSolve(T, opt) {
  opt = opt || {};
  var perm = giftSyms(T.cubes, 'permitted');
  if (opt.only) perm = perm.filter(function (s) { return Eq.isDigit(s) || opt.only.indexOf(s) >= 0; });
  var req = giftSyms(T.cubes, 'required'), digits = req.concat(perm).filter(Eq.isDigit).length; // at most 14 cubes, so search them all
  return Eq.solve({ goal: T.goal, req: req, opt: perm, mode: 'free', fractions: opt.fr !== undefined ? opt.fr : T.fr, maxDigits: Math.max(6, digits), timeMs: opt.ms || 1500 });
}
function giftMat(T, opts) {
  opts = opts || {};
  function zone(name, title, sub) {
    var cs = T.cubes.filter(function (c) { return c.zone === name; });
    return '<div class="zone z-' + name + '"><h3>' + title + ' <small>' + sub + '</small></h3><div class="cubes">' +
      (cs.map(function (c) { return giftCube(c, (opts.hl && opts.hl.indexOf(c.id) >= 0 ? 'hl' : '') + (opts.tap ? ' gf-tap' : ''), opts.tap, c.id); }).join('') || '<span class="empty">empty</span>') + '</div></div>';
  }
  return '<div class="mat gf-mat">' +
    (T.goal ? '<div class="zone z-goal"><h3>🎯 GOAL <span class="gval">= ' + Eq.fmt(T.goal) + '</span></h3><div class="cubes">' + tokensHTML(T.goalTokens, T.cubes) + '</div></div>' : '') +
    '<div class="zrow">' + zone('required', '✅ REQUIRED', 'must use') + zone('permitted', '👍 PERMITTED', 'may use') + zone('forbidden', '⛔ FORBIDDEN', 'can\'t use') + '</div></div>';
}

// ----- Entry points -----
// A tile for Training Camp or "Play with people" (see docs/handoff/gift.md).
function giftTileHTML() {
  var sv = giftSave(), n = Object.keys(sv.solved).length;
  return '<div class="opp mode gf-tile" data-act="giftOpen"><span class="avatar lg" style="background:#ffe3ec;color:#1d2340;font-size:44px">💌</span><h3>Puzzle from Tata</h3><div class="otitle">Tata makes a puzzle, you crack it!</div>' +
    '<div class="otitle">' + (n ? n + ' solved' : 'Got a code? Type it in!') + '</div></div>';
}
ACT.giftOpen = function () {
  if (current !== 'gift') GIFT.from = current;
  closeModal(); GIFT.view = 'hub'; giftRender(); giftMood('menu');
};
ACT.giftBack = function () {
  closeModal();
  if (GIFT.view !== 'hub') { GIFT.view = 'hub'; giftRender(); return; }
  var f = GIFT.from;
  if (f === 'camp' && ACT.camp) ACT.camp();
  else if (f === 'setup' && ACT.setup) ACT.setup();
  else if (ACT.home) ACT.home();
};
ACT.giftEnter = function () { GIFT.view = 'enter'; GIFT.enterErr = ''; giftRender(); setTimeout(function () { var i = $('#gfCode'); if (i) i.focus(); }, 50); };
ACT.giftMake = function () { if (!GIFT.M) giftNewMaker(); GIFT.view = 'make'; giftRender(); };
ACT.giftReceipts = function () { GIFT.view = 'receipt'; GIFT.rcOut = ''; giftRender(); };

// Called at start-up and when the page's #hash changes: '#puzzle=...' opens that puzzle.
function giftFromHash() {
  var h = GiftCode.parseHash(location.hash);
  if (!h) return false;
  try { if (history.replaceState) history.replaceState(null, '', location.pathname + location.search); else location.hash = ''; } catch (e) {}
  if (current !== 'gift') GIFT.from = (current === 'splash' || current === 'intro' || current === 'dedication') ? 'title' : current;
  closeModal();
  var d = GiftCode.decode(h.code);
  if (d.ok) giftStartSolve(d, h.msg || giftMadeMsg(d.code));
  else { GIFT.view = 'enter'; GIFT.enterCode = h.code; GIFT.enterErr = d.msg; giftRender(); }
  return true;
}
window.addEventListener('hashchange', function () { if (typeof S !== 'undefined') giftFromHash(); });

function giftRender() {
  var el = giftShow(), v = GIFT.view;
  if (v === 'make') { giftRenderMaker(el); return; }
  if (v === 'solve') { giftRenderSolve(el); return; }
  if (v === 'enter') { giftRenderEnter(el); return; }
  if (v === 'receipt') { giftRenderReceipt(el); return; }
  var sv = giftSave(), solved = Object.keys(sv.solved).length;
  el.innerHTML = giftHdr('💌 Puzzle from Tata') +
    giftCoach('Tata makes a puzzle and sends you a <b>code</b>. You type it in and crack it! No internet needed.' + (solved ? ' You\'ve solved <b>' + solved + '</b> so far.' : ''), 'happy') +
    '<div class="gf-menu">' +
    '<button class="btn big green" data-act="giftEnter">' + ico('pencil') + ' I have a puzzle code</button>' +
    '<button class="btn big purple" data-act="giftMake">' + ico('cube') + ' Make a puzzle</button>' +
    '<button class="btn" data-act="giftReceipts">' + ico('check') + ' Check a receipt</button>' +
    '</div><p class="gf-small white">Making a puzzle and checking receipts are for grown-ups (or for making one for a friend!).</p>';
}

// ======================= Solver side =======================
function giftRenderEnter(el) {
  el.innerHTML = giftHdr('💌 Type the code') +
    giftCoach('Type the code Tata gave you. Dashes and spaces don\'t matter, and small letters are fine.', 'happy') +
    '<div class="panel gf-panel"><input id="gfCode" class="gf-input gf-codein" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="48" placeholder="TABC-DEFG-HJKL" value="' + esc(GIFT.enterCode || '') + '" onkeydown="if(event.key===\'Enter\')ACT.giftEnterGo()">' +
    (GIFT.enterErr ? '<p class="gf-err">' + esc(GIFT.enterErr) + '</p>' : '') +
    '<div class="row" style="margin-top:12px"><button class="btn big green" data-act="giftEnterGo">' + ico('play') + ' Open it!</button></div></div>';
}
ACT.giftEnterGo = function () {
  var i = $('#gfCode'), code = i ? i.value : GIFT.enterCode;
  GIFT.enterCode = code;
  var d = GiftCode.decode(code);
  if (!d.ok) { GIFT.enterErr = d.msg; giftSnd('boop'); giftRender(); return; }
  GIFT.enterErr = ''; GIFT.enterCode = '';
  giftStartSolve(d, giftMadeMsg(d.code));
};
// A puzzle made on this device remembers its message, so the short code shows it too.
function giftMadeMsg(code) { var m = giftSave().made.filter(function (x) { return x.code === code; })[0]; return m ? m.msg : ''; }
function giftStartSolve(d, msg) {
  var T = giftTable(d.p);
  GIFT.P = { raw: d.code, msg: GiftCode.cleanMsg(msg), T: T, sample: null, hintIds: null, hints: 0, shown: [], t0: Date.now(), retry: null, note: giftOpsNote(T) };
  GIFT.view = 'solve';
  GIFT.P.say = { text: giftIntroText(GIFT.P), mood: 'happy' };
  giftRender(); giftMood('think');
}
function giftIntroText(P) {
  var sv = giftSave().solved[P.raw];
  return (sv ? 'You\'ve cracked this one before! Want to do it again? ' : '') + 'Make the Goal using <b>every Required cube</b> and any Permitted cubes. Take as long as you like!';
}
// One line when the puzzle needs an operation (or fractions) he hasn't unlocked yet. He can still play.
function giftOpsNote(T) {
  var st = stageInfo(), locked = Eq.OPS.filter(function (o) { return st.ops.indexOf(o) < 0; }), need = [];
  function addOps(list) { list.forEach(function (s) { if (locked.indexOf(s) >= 0 && need.indexOf(s) < 0) need.push(s); }); }
  addOps(T.goalTokens.map(function (t) { return typeof t === 'string' ? t : t.s; }));
  addOps(giftSyms(T.cubes, 'required'));
  var permLocked = giftSyms(T.cubes, 'permitted').filter(function (s) { return locked.indexOf(s) >= 0; });
  var noFrac = T.fr && !st.fractions, fracNeed = noFrac && !!T.goal && T.goal.d !== 1;
  // Is there a Solution with only his operations (and no fractions if he hasn't got them)?
  if (T.goal && !fracNeed && !giftSolve(T, { only: st.ops, fr: T.fr && st.fractions, ms: 500 }).found) {
    var opsOK = !permLocked.length || giftSolve(T, { only: st.ops, fr: T.fr, ms: 500 }).found; // fractions are the only problem
    if (!opsOK) addOps(permLocked);
    if (noFrac && (opsOK || !giftSolve(T, { fr: false, ms: 500 }).found)) fracNeed = true;
  }
  if (!need.length && !fracNeed) return '';
  var parts = need.map(function (o) { return '<b>' + show(o) + '</b>'; });
  if (fracNeed) parts.push('<b>fractions</b>');
  return '🔓 Heads up: this one needs ' + parts.join(' and ') + ', which you haven\'t unlocked yet. You can still give it a go!';
}
function giftRenderSolve(el) {
  var P = GIFT.P, T = P.T, done = giftSave().solved[P.raw];
  var msg = P.msg ? '<div class="gf-letter"><span class="gf-letter-ico">💌</span><div><small>Tata says:</small><div class="gf-letter-txt">“' + esc(P.msg) + '”</div></div></div>' : '';
  el.innerHTML = giftHdr('💌 Puzzle from Tata', 'giftOpen') + msg +
    giftCoach(P.say.text, P.say.mood) +
    (P.note ? '<p class="gf-note">' + P.note + '</p>' : '') +
    giftMat(T, { hl: P.shown }) +
    (done ? '<div class="panel gf-receipt-box"><div>Tell Tata your receipt:</div><div class="gf-rc">' + esc(done.r) + '</div><small>Code ' + esc(GiftCode.pretty(P.raw)) + '</small></div>' : '') +
    '<div class="row" style="margin-top:14px"><button class="btn big green" data-act="giftSolveIt">' + ico('pencil') + ' Solve it!</button><button class="btn" data-act="giftHint">' + ico('bulb') + ' Hint</button></div>';
}
function giftCtx(T) {
  return { goal: T.goal, zone: function (id) { return T.cubes[id] ? T.cubes[id].zone : 'forbidden'; }, required: T.cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; }),
    mode: 'daily', fractions: T.fr, label: function (id) { return T.cubes[id] ? show(T.cubes[id].s) : '?'; } };
}
ACT.giftSolveIt = function (el, e, keep) {
  var T = GIFT.P.T, ids = function (z) { return T.cubes.filter(function (c) { return c.zone === z; }).map(function (c) { return c.id; }); };
  B = { kind: 'solution', mode: 'daily', tokens: keep ? keep.slice() : [], cubes: T.cubes, goal: T.goal, goalTokens: T.goalTokens, fractions: T.fr, title: '💌 Tata\'s puzzle',
    pools: [{ label: '✅ Required (use them ALL)', ids: ids('required'), req: true }, { label: '👍 Permitted (use any)', ids: ids('permitted') }, { label: '⛔ Forbidden (can\'t use)', ids: ids('forbidden'), forb: true }],
    onDone: giftChecked };
  renderBuilder(); $('#builder').classList.add('on');
};
function giftChecked(tokens) {
  if (!tokens) return;
  var P = GIFT.P, T = P.T, chk = Eq.checkSolution(tokens, giftCtx(T)), sv = giftSave();
  var first = !sv.solved[P.raw], madeHere = sv.made.some(function (m) { return m.code === P.raw; });
  xpLog = [];
  var gSave = (typeof G !== 'undefined') ? G : null; G = null; // recordSolution reads G for the in-game hint bonus
  // Skill star: only the first time this code is solved, and not for puzzles made on this device.
  var star = chk.ok && first && !madeHere && !ladderOff() && S.ladder.stage < STAGES.length - 1;
  recordSolution(chk, Date.now() - P.t0, tokens, 'gift', T.goal, !(chk.ok && first && !madeHere));
  G = gSave;
  if (!chk.ok) {
    giftSnd('boop');
    P.retry = tokens;
    P.say = { text: 'Not yet, but that\'s OK! Look at what to fix and try again. ' + (P.hintIds && P.hints >= P.hintIds.length ? '' : 'Stuck? <b>Hint</b> shows one cube that\'s used.'), mood: 'think' };
    giftRender();
    modal('<h2>🤔 Not quite!</h2>' + exprBox(tokens, T.cubes) + '<ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: T.goal, fractions: T.fr, cubes: T.cubes, chk: chk }) : '') + /* EXPLAIN */
      '<p style="text-align:center">Good try! Fix it, or start fresh. You can try as many times as you like.</p>' +
      '<div class="row"><button class="btn green" data-act="giftFix">' + ico('pencil') + ' Fix it</button><button class="btn" data-act="giftFresh">Start fresh</button><button class="btn" data-act="closeModal">Not now</button></div>');
    return;
  }
  if (first) {
    sv.solved[P.raw] = { t: Date.now(), h: P.hints, r: GiftCode.receipt(P.raw, P.hints), m: P.msg };
    giftCapSolved(sv);
    addXP(GIFT_XP.first, 'Puzzle from Tata solved!');
    persist();
  }
  if (typeof checkBadges === 'function') checkBadges({ type: 'gift' });
  var rc = sv.solved[P.raw].r;
  giftSnd('chime'); if (typeof victoryFX === 'function') victoryFX(); giftSnd('crowd');
  P.say = { text: first ? 'You cracked Tata\'s puzzle! 🎉 Tell Tata your receipt so he knows.' : 'You did it again! 🎉 Same receipt as before.', mood: 'cheer' };
  giftRender();
  modal('<h2>🎉 You cracked it!</h2>' + exprBox(tokens, T.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(T.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: T.goal, fractions: T.fr, cubes: T.cubes, chk: chk }) : '') + /* EXPLAIN */
    (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + (star ? '<br>⭐ Skill star for a new puzzle!' : '') + '</div>' : '') +
    '<div class="gf-tell"><div>📣 Tell Tata:</div><div class="gf-rc">' + esc(rc) + '</div><small>That\'s your receipt. Tata can check it on his screen.</small></div>' +
    '<div class="row"><button class="btn green big" data-act="closeModal">Yay!</button></div>', function () { drainQueue(function () { if (current === 'gift') giftRender(); }); });
}
ACT.giftFix = function () { closeModal(); ACT.giftSolveIt(null, null, GIFT.P.retry || []); };
ACT.giftFresh = function () { closeModal(); ACT.giftSolveIt(); };
function giftCapSolved(sv) {
  var keys = Object.keys(sv.solved);
  if (keys.length <= GIFT_CAP.solved) return;
  keys.sort(function (a, b) { return (sv.solved[a].t || 0) - (sv.solved[b].t || 0); });
  keys.slice(0, keys.length - GIFT_CAP.solved).forEach(function (k) { delete sv.solved[k]; });
}
// Hint: shows one more cube that a Solution uses (Required cubes are already known to be used).
ACT.giftHint = function () {
  var P = GIFT.P, T = P.T;
  if (!P.hintIds) {
    var r = giftSolve(T, { ms: 2000 }), taken = {};
    P.hintIds = [];
    if (r.found) {
      var reqLeft = {}; giftSyms(T.cubes, 'required').forEach(function (s) { reqLeft[s] = (reqLeft[s] || 0) + 1; });
      r.tokens.forEach(function (s) {
        if (s === '(' || s === ')') return;
        if (reqLeft[s]) { reqLeft[s]--; return; } // this one can be a Required cube
        var c = T.cubes.filter(function (x) { return x.zone === 'permitted' && x.s === s && !taken[x.id]; })[0];
        if (c) { taken[c.id] = 1; P.hintIds.push(c.id); }
      });
      // digits first: they are the most helpful
      P.hintIds.sort(function (a, b) { return (Eq.isDigit(T.cubes[b].s) ? 1 : 0) - (Eq.isDigit(T.cubes[a].s) ? 1 : 0); });
    } else P.hintIds = null;
  }
  giftSnd('pop');
  if (!P.hintIds) { P.say = { text: 'Hmm, I couldn\'t work out a hint this time. Try a few different cubes!', mood: 'think' }; giftRender(); P.hintIds = null; return; }
  if (!P.hintIds.length) { P.say = { text: 'Hint: you don\'t need any Permitted cubes! Every cube you need is <b>Required</b>. Use them all.', mood: 'think' }; giftRender(); return; }
  if (P.hints >= P.hintIds.length) {
    P.say = { text: 'You\'ve seen every Permitted cube in my Solution (they glow on the mat)' + (giftSyms(T.cubes, 'required').length ? ', plus the Required ones' : '') + '. Now put them together!', mood: 'think' };
    giftRender(); return;
  }
  var id = P.hintIds[P.hints++]; P.shown.push(id);
  P.say = { text: 'Hint: the <span class="gf-inline">' + giftCube(T.cubes[id], 'tiny') + '</span> is used in a Solution' + (giftSyms(T.cubes, 'required').length ? ' (with all the Required cubes)' : '') + '. It glows on the mat.' + (P.hints < P.hintIds.length ? ' Tap Hint again for another.' : ''), mood: 'think' };
  giftRender();
};

// ======================= Maker side =======================
function giftNewMaker() { GIFT.M = { cubes: [], goalTokens: null, goal: null, fr: !!stageInfo().fractions, msg: '', result: null, err: '', showSample: false }; }
function giftReadMsg() { var i = $('#gfMsg'); if (i && GIFT.M) GIFT.M.msg = i.value; }
function giftColorCount(M, color) { return M.cubes.filter(function (c) { return c.color === color; }).length; }
function giftReindex(M) { M.cubes.forEach(function (c, i) { c.id = i; c.order = i; }); }
function giftChanged(M) { M.result = null; M.err = ''; M.showSample = false; }
function giftPuzzleOf(M) {
  function z(name) { return M.cubes.filter(function (c) { return c.zone === name; }); }
  return { fr: M.fr, goal: (M.goalTokens || []).map(function (t) { return typeof t === 'string' ? t : { color: M.cubes[t.id].color, s: t.s }; }), req: z('required'), forb: z('forbidden'), perm: z('permitted') };
}
function giftRenderMaker(el) {
  var M = GIFT.M, n = M.cubes.length, goalSet = !!M.goalTokens;
  var html = giftHdr('💌 Make a puzzle') +
    giftCoach(goalSet ? 'Now tap cubes to make them <b>Required ✅</b> or <b>Forbidden ⛔</b> (optional), write a message, and I\'ll check it can be solved.' : 'Pick the cubes on the table (6 to 14, Goal included), then build the Goal from them. I\'ll check it can be solved before I give you a code.', 'happy');
  // 1. cubes
  html += '<div class="panel gf-panel"><h3 class="gf-h">1. Cubes on the table <small>' + n + ' / ' + GiftCode.MAX_CUBES + '</small></h3>';
  if (!goalSet) {
    html += '<div class="gf-palette">' + Eq.COLORS.map(function (col) {
      var full = giftColorCount(M, col) >= GiftCode.PER_COLOR || n >= GiftCode.MAX_CUBES;
      return '<div class="gf-prow"><span class="gf-pname">' + col + ' <small>' + giftColorCount(M, col) + '/6</small></span>' + Eq.CUBE_FACES[col].map(function (s) { return giftCube({ color: col, s: s }, full ? 'used' : 'gf-tap', 'giftAdd', col + ':' + s); }).join('') + '</div>';
    }).join('') + '</div>' +
      '<div class="gf-table">' + (n ? M.cubes.map(function (c) { return giftCube(c, 'gf-tap', 'giftRemove', c.id); }).join('') : '<span class="gf-small">Tap the cubes above to put them on the table.</span>') + '</div>' +
      (n ? '<p class="gf-small">Tap a cube on the table to take it off.</p>' : '') +
      '<div class="row"><button class="btn" data-act="giftRoll">' + ico('dice') + ' Roll for me</button>' + (n ? '<button class="btn small" data-act="giftClear">Clear</button>' : '') + '</div>';
  } else {
    html += giftMat({ cubes: M.cubes, goalTokens: M.goalTokens, goal: M.goal }, { tap: 'giftZone' }) +
      '<p class="gf-small">Tap a cube: Permitted → Required → Forbidden → Permitted.</p>';
  }
  html += '</div>';
  // 2. goal and fractions
  html += '<div class="panel gf-panel"><h3 class="gf-h">2. The Goal</h3>' +
    (goalSet ? '<div class="gf-goalline"><span class="expr">' + tokensHTML(M.goalTokens, M.cubes) + '</span> <b>= ' + Eq.fmt(M.goal) + '</b> <button class="btn small" data-act="giftUnGoal">Change the Goal or cubes</button></div>'
      : '<div class="row"><button class="btn green" data-act="giftBuildGoal"' + (n < GiftCode.MIN_CUBES ? ' disabled' : '') + '>' + ico('target') + ' Build the Goal</button></div>' + (n < GiftCode.MIN_CUBES ? '<p class="gf-small">Put at least ' + GiftCode.MIN_CUBES + ' cubes on the table first.</p>' : '')) +
    '<div class="gf-frrow"><b>Fractions</b> <div class="seg"><button class="' + (M.fr ? '' : 'on') + '" data-act="giftFr" data-arg="0">Off</button><button class="' + (M.fr ? 'on' : '') + '" data-act="giftFr" data-arg="1">On</button></div>' +
    '<small>' + (M.fr ? 'Divisions may make fractions.' : 'Every division must come out whole.') + '</small></div></div>';
  // 3. message + check
  if (goalSet) {
    html += '<div class="panel gf-panel"><h3 class="gf-h">3. A message <small>optional, up to ' + GiftCode.MSG_MAX + ' letters</small></h3>' +
      '<input id="gfMsg" class="gf-input" type="text" maxlength="' + GiftCode.MSG_MAX + '" placeholder="Bet you can\'t get this one!" value="' + esc(M.msg) + '">' +
      '<p class="gf-small">The message travels in the link. The short code works without it.</p>' +
      '<div class="row" style="margin-top:10px"><button class="btn big green" data-act="giftCheck">' + ico('check') + ' Check it &amp; make the code</button></div>' +
      (M.err ? '<div class="gf-err">' + M.err + '</div>' : '') + giftResultHTML(M) + '</div>';
  } else if (M.err) html += '<div class="panel gf-panel"><div class="gf-err">' + M.err + '</div></div>';
  el.innerHTML = html;
}
function giftResultHTML(M) {
  var R = M.result; if (!R) return '';
  var cnt = R.count >= 20 ? '20 or more' : (R.more ? 'at least ' : '') + R.count;
  var lnk = GiftCode.link(R.code, M.msg, location.origin + location.pathname);
  return '<div class="gf-result"><div class="gf-ok">✔ It can be solved! ' + (R.count === 1 && !R.more ? 'I found exactly <b>1</b> way.' : 'I found <b>' + cnt + '</b> different way' + (R.count === 1 ? '' : 's') + '.') + '</div>' +
    (R.count === 1 && !R.more ? '<p class="gf-small">Only one way: that\'s a tough one!</p>' : '') +
    (M.showSample ? '<div class="gf-sample">One Solution: ' + exprBox(R.sample) + (window.Explain ? Explain.buttonHTML(R.sample, { goal: M.goal, fractions: M.fr }) : '') + '</div>' /* EXPLAIN */ : '<button class="btn small" data-act="giftSample">Show me one Solution</button>') +
    '<div class="gf-codelabel">The code (read it out or text it):</div><div class="gf-code" id="gfCodeOut">' + esc(GiftCode.pretty(R.code)) + '</div>' +
    '<div class="row"><button class="btn green" data-act="giftCopy" data-arg="code">Copy code</button></div>' +
    '<div class="gf-codelabel">Or the link (with your message):</div><input id="gfLink" class="gf-input gf-link" type="text" readonly value="' + esc(lnk) + '" onclick="this.select()">' +
    '<div class="row"><button class="btn" data-act="giftCopy" data-arg="link">Copy link</button></div>' +
    '<p class="gf-small" id="gfCopied"></p></div>';
}
ACT.giftAdd = function (el) {
  var M = GIFT.M, a = el.dataset.arg.split(':');
  giftReadMsg();
  if (M.cubes.length >= GiftCode.MAX_CUBES || giftColorCount(M, a[0]) >= GiftCode.PER_COLOR) { giftSnd('boop'); return; }
  M.cubes.push({ id: M.cubes.length, color: a[0], s: a[1], zone: 'permitted', order: M.cubes.length, locked: false });
  giftChanged(M); giftSnd('click'); giftRender();
};
ACT.giftRemove = function (el) { var M = GIFT.M; M.cubes.splice(+el.dataset.arg, 1); giftReindex(M); giftChanged(M); giftSnd('click'); giftRender(); };
ACT.giftClear = function () { var M = GIFT.M; M.cubes = []; giftChanged(M); giftRender(); };
// Roll for me: a real roll of all 24 cubes, then 6 digits and 4 operation cubes from it
// (operations he has unlocked first).
ACT.giftRoll = function () {
  var M = GIFT.M, st = stageInfo(), roll = shuffle(Eq.roll(), Math.random);
  var digs = roll.filter(function (c) { return Eq.isDigit(c.s); });
  var opsOk = roll.filter(function (c) { return !Eq.isDigit(c.s) && st.ops.indexOf(c.s) >= 0; }), opsOther = roll.filter(function (c) { return !Eq.isDigit(c.s) && st.ops.indexOf(c.s) < 0; });
  var pickC = digs.slice(0, 6).concat(opsOk.concat(opsOther).slice(0, 4));
  if (pickC.length < 10) pickC = pickC.concat(roll.filter(function (c) { return pickC.indexOf(c) < 0; }).slice(0, 10 - pickC.length));
  pickC.sort(function (a, b) { var da = Eq.isDigit(a.s), db = Eq.isDigit(b.s); return da !== db ? (da ? -1 : 1) : (a.s < b.s ? -1 : a.s > b.s ? 1 : 0); });
  giftReadMsg();
  M.cubes = pickC.map(function (c, i) { return { id: i, color: c.color, s: c.s, zone: 'permitted', order: i, locked: false }; });
  giftChanged(M); giftSnd('pop'); giftRender();
};
ACT.giftBuildGoal = function () {
  var M = GIFT.M;
  giftReadMsg();
  if (M.cubes.length < GiftCode.MIN_CUBES) return;
  B = { kind: 'goal', tokens: [], pools: [{ label: '🎲 Cubes on the table', ids: M.cubes.map(function (c) { return c.id; }) }], cubes: M.cubes, fractions: M.fr, title: 'Build the Goal',
    onDone: function (tokens, value) {
      giftChanged(M);
      var used = {}; tokens.forEach(function (t) { if (typeof t === 'object') used[t.id] = 1; });
      if (tokens.length > GiftCode.MAX_GOAL_TOKENS) { M.err = 'That Goal has too many ( ). Try it with fewer.'; giftRender(); return; }
      if (M.cubes.length - Object.keys(used).length < 2) { M.err = 'Leave at least 2 cubes on the table for the Solution. Add more cubes, or use fewer in the Goal.'; giftRender(); return; }
      M.cubes.forEach(function (c) { c.zone = used[c.id] ? 'goal' : 'permitted'; });
      M.goalTokens = tokens.map(function (t) { return typeof t === 'string' ? t : { s: t.s, id: t.id }; }); M.goal = value;
      giftRender();
    } };
  renderBuilder(); $('#builder').classList.add('on');
};
ACT.giftUnGoal = function () { var M = GIFT.M; giftReadMsg(); M.goalTokens = null; M.goal = null; M.cubes.forEach(function (c) { c.zone = 'permitted'; }); giftChanged(M); giftRender(); };
ACT.giftZone = function (el) {
  var M = GIFT.M, c = M.cubes[+el.dataset.arg]; if (!c || c.zone === 'goal') return;
  giftReadMsg();
  c.zone = { permitted: 'required', required: 'forbidden', forbidden: 'permitted' }[c.zone];
  giftChanged(M); giftSnd('click'); giftRender();
};
ACT.giftFr = function (el) {
  var M = GIFT.M, fr = el.dataset.arg === '1';
  giftReadMsg();
  if (fr === M.fr) return;
  M.fr = fr; giftChanged(M);
  if (M.goalTokens) {
    var g = Eq.checkGoal(M.goalTokens.map(function (t) { return typeof t === 'string' ? t : t.s; }), fr);
    if (!g.ok) { ACT.giftUnGoal(); M.err = 'With fractions off, that Goal doesn\'t work any more, so build it again.'; giftRender(); return; }
    M.goal = g.value;
  }
  giftRender();
};
ACT.giftSample = function () { giftReadMsg(); GIFT.M.showSample = true; giftRender(); };
ACT.giftCheck = function () {
  var M = GIFT.M;
  giftReadMsg();
  M.msg = GiftCode.cleanMsg(M.msg);
  giftChanged(M);
  var p = giftPuzzleOf(M), why = GiftCode.problem(p);
  if (why) { M.err = esc(why); giftRender(); return; }
  var btn = $('[data-act="giftCheck"]'); if (btn) { btn.disabled = true; btn.innerHTML = 'Checking…'; }
  setTimeout(function () { // let the "Checking…" paint first
    var T = { cubes: M.cubes, goal: M.goal, fr: M.fr }, r = giftSolve(T, { ms: 2500 });
    if (!r.found) {
      var req = giftSyms(M.cubes, 'required');
      M.err = r.complete
        ? '✘ There is <b>no Solution</b>: no way to make ' + Eq.fmt(M.goal) + ' with these cubes' + (req.length ? ' that uses every Required cube' : '') + '. Try another Goal, other cubes, or fewer Required / Forbidden cubes.'
        : '✘ I couldn\'t find a Solution, and there were too many possibilities to be sure there isn\'t one. Try fewer cubes or a smaller Goal, so I can check properly.';
      giftSnd('boop'); giftRender(); return;
    }
    var cnt = giftCount(M, r);
    var code = GiftCode.encode(p);
    M.result = { code: code, count: cnt.count, more: cnt.more, sample: r.tokens };
    var sv = giftSave();
    sv.made = sv.made.filter(function (x) { return x.code !== code; });
    sv.made.unshift({ code: code, msg: M.msg, t: Date.now(), g: Eq.fmt(M.goal), n: cnt.count });
    if (sv.made.length > GIFT_CAP.made) sv.made.length = GIFT_CAP.made;
    persist();
    giftSnd('chime'); giftRender();
    var o = $('#gfCodeOut'); if (o && o.scrollIntoView) o.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 30);
};
// How many different ways (Eq.allWays, same rules as How Many Ways?), keeping those that use every
// Required cube. Capped at 20; 'more' = the count may be higher than shown.
function giftCount(M, r) {
  var req = giftSyms(M.cubes, 'required'), perm = giftSyms(M.cubes, 'permitted'), need = {};
  req.forEach(function (s) { need[s] = (need[s] || 0) + 1; });
  var a = null;
  try { a = Eq.allWays({ cubes: req.concat(perm), fractions: M.fr, timeMs: 400, maxNodes: 120000 }); } catch (e) { a = null; }
  var list = a ? (a.byValue[M.goal.n + '/' + M.goal.d] || []) : [];
  var n = list.filter(function (w) {
    var have = {}; w.tokens.forEach(function (s) { have[s] = (have[s] || 0) + 1; });
    for (var k in need) if ((have[k] || 0) < need[k]) return false;
    return true;
  }).length;
  // A Required cube can sometimes only join in as a "helper" (like + 0), which the way-counter folds
  // away, so the solver's Solution always counts as at least one.
  var more = !a || !a.complete || (n === 0) || req.length > 0;
  return { count: Math.min(20, Math.max(1, n)), more: more && n < 20 };
}
ACT.giftCopy = function (el) {
  var M = GIFT.M, R = M && M.result; if (!R) return;
  var text = el.dataset.arg === 'link' ? GiftCode.link(R.code, M.msg, location.origin + location.pathname) : GiftCode.pretty(R.code);
  function said(ok) { var p = $('#gfCopied'); if (p) p.textContent = ok ? 'Copied! Paste it into a text message.' : 'Couldn\'t copy here. Press and hold the text to copy it.'; }
  function fallback() {
    try { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); said(ok); } catch (e) { said(false); }
  }
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { said(true); }, fallback); else fallback(); } catch (e) { fallback(); }
};

// ======================= Check a receipt =======================
function giftRenderReceipt(el) {
  var sv = giftSave();
  var list = sv.made.slice(0, 10).map(function (m) {
    return '<div class="gf-made"><span class="gf-made-code">' + esc(GiftCode.pretty(m.code)) + '</span><span>Goal ' + esc(m.g || '?') + '</span>' + (m.msg ? '<span class="gf-small">“' + esc(m.msg) + '”</span>' : '') + '</div>';
  }).join('');
  el.innerHTML = giftHdr('💌 Check a receipt') +
    giftCoach('When the puzzle is solved, the game shows a <b>4-letter receipt</b>. Type it here and I\'ll tell you which puzzle it belongs to.', 'happy') +
    '<div class="panel gf-panel"><label class="gf-codelabel" for="gfRc">Receipt</label><input id="gfRc" class="gf-input gf-codein" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" onkeydown="if(event.key===\'Enter\')ACT.giftRcGo()">' +
    '<label class="gf-codelabel" for="gfRcCode">Puzzle code <small>(only if it was made on another device)</small></label><input id="gfRcCode" class="gf-input" type="text" maxlength="48" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="TABC-DEFG-HJKL">' +
    '<div class="row" style="margin-top:10px"><button class="btn big green" data-act="giftRcGo">' + ico('check') + ' Check</button></div>' +
    (GIFT.rcOut ? '<div class="gf-rcout">' + GIFT.rcOut + '</div>' : '') + '</div>' +
    (list ? '<div class="panel gf-panel"><h3 class="gf-h">Puzzles made on this device</h3>' + list + '</div>' : '');
}
ACT.giftRcGo = function () {
  var rc = GiftCode.clean(($('#gfRc') || {}).value), codeIn = ($('#gfRcCode') || {}).value || '', sv = giftSave();
  function hintsTxt(h) { return h === 0 ? 'with no hints' : h === 1 ? 'with 1 hint' : h === 2 ? 'with 2 hints' : 'with 3 or more hints'; }
  if (rc.length !== 4) { GIFT.rcOut = '<span class="gf-err">A receipt has 4 letters or numbers.</span>'; giftRender(); return; }
  var cands = [];
  if (GiftCode.clean(codeIn)) {
    var d = GiftCode.decode(codeIn);
    if (!d.ok) { GIFT.rcOut = '<span class="gf-err">That puzzle code has a problem: ' + esc(d.msg) + '</span>'; giftRender(); return; }
    cands.push({ code: d.code, msg: '' });
  } else cands = sv.made;
  for (var i = 0; i < cands.length; i++) {
    var r = GiftCode.checkReceipt(cands[i].code, rc);
    if (r.ok) {
      GIFT.rcOut = '<div class="gf-ok">✔ Yes! That receipt is real. Puzzle <b>' + esc(GiftCode.pretty(cands[i].code)) + '</b>' + (cands[i].msg ? ' (“' + esc(cands[i].msg) + '”)' : '') + ' was solved ' + hintsTxt(r.hints) + '.</div>';
      giftSnd('chime'); giftRender(); return;
    }
  }
  GIFT.rcOut = '<span class="gf-err">That receipt doesn\'t match ' + (cands.length === 1 ? 'that puzzle' : cands.length ? 'any puzzle made on this device' : 'anything yet: no puzzles were made on this device, so type the puzzle code too') + '. Check the letters (receipts never use 0, O, 1 or I).</span>';
  giftSnd('boop'); giftRender();
};
