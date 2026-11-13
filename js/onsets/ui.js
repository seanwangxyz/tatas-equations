'use strict';
// ======================= ON-SETS: DRAWING + TAP-TO-BUILD =======================
// Cards, cubes, the Goal picture, and the two builders (Set-Name and Goal). Uses the site's shared helpers
// (esc, ico, $, Snd, ACT) and OSE (js/onsets/engine.js). Everything here is prefixed os / OSUI.
var OSUI = (function () {
  // ---- Card sounds (js/sound.js Snd.card: 'lift' | 'place' | 'flip'); a no-op where the sound module has none ----
  function cardSnd(kind) { try { if (window.Snd && Snd.card) { Snd.card(kind); return true; } } catch (e) {} return false; }
  // ---- Cards ----
  function cardHTML(card, opts) {
    opts = opts || {};
    var cls = 'os-card' + (opts.lit ? ' lit' : '') + (opts.dim ? ' dim' : '') + (opts.pick ? ' pick' : '') + (opts.small ? ' sm' : '') + (opts.out ? ' out' : '');
    var dots = OSE.COLORS.map(function (c) { return '<i class="' + (OSE.cardHas(card, c) ? 'd-' + c : 'none') + '"></i>'; }).join('');
    var name = OSE.cardName(card);
    return '<div class="' + cls + '"' + (opts.act ? ' data-act="' + opts.act + '" data-arg="' + opts.i + '"' : '') + ' role="img" aria-label="' + (name === 'blank' ? 'blank card' : 'card ' + name.split('').map(function (c) { return OSE.COLOR_NAME[c]; }).join(' ')) + '">' + dots + '</div>';
  }
  // universe: cards; set: bitmask to light up (null = none); opts.act: tap action; opts.picked: {i:1}
  function universeHTML(universe, set, opts) {
    opts = opts || {};
    return '<div class="os-uni' + (opts.cls ? ' ' + opts.cls : '') + '">' + universe.map(function (card, i) {
      var on = set != null && (set & (1 << i)) !== 0;
      return cardHTML(card, { lit: on || (opts.picked && opts.picked[i]), dim: set != null && !on && !opts.noDim, pick: !!opts.act, act: opts.act, i: i, small: opts.small, out: opts.out && opts.out[i] });
    }).join('') + '</div>';
  }
  // ---- Cubes ----
  function faceHTML(s) {
    if (OSE.isColor(s)) return '<b class="os-dot d-' + s + '"></b>';
    return '<span>' + esc(OSE.show(s)) + '</span>';
  }
  function cubeHTML(c, cls, act) {
    var k = c.kind || OSE.kindOf(c.s);
    return '<div class="os-cube k-' + k + (c.neg ? ' neg' : '') + (cls ? ' ' + cls : '') + '"' + (c.id != null ? ' data-id="' + c.id + '"' : '') + (act ? ' data-act="' + act + '" data-arg="' + c.id + '"' : '') + ' aria-label="' + esc(cubeWord(c.s)) + '">' + faceHTML(c.s) + '</div>';
  }
  function cubeWord(s) { return OSE.isColor(s) ? OSE.COLOR_NAME[s] : OSE.isDigit(s) ? s : (OSE.WORD[s] || s); }
  // A Set-Name drawn as mini cubes (tokens = syms or {s,id}); act = tap action for each token (data-bi = index)
  function exprHTML(tokens, cubes, act) {
    if (!tokens || !tokens.length) return '';
    return tokens.map(function (t, i) {
      var s = OSE.symOf(t);
      if (s === '(' || s === ')') return '<span class="os-paren"' + (act ? ' data-act="' + act + '" data-bi="' + i + '"' : '') + '>' + s + '</span>';
      var c = (typeof t === 'object' && cubes && t.id != null && t.id >= 0 && cubes[t.id]) || { s: s };
      return '<div class="os-cube mini k-' + OSE.kindOf(s) + '"' + (act ? ' data-act="' + act + '" data-bi="' + i + '"' : '') + '>' + faceHTML(s) + '</div>';
    }).join('');
  }
  function exprText(tokens) { return OSE.exprText(tokens); }
  // ---- The Goal picture (side by side = add, stacked = multiply) ----
  var LAYOUT = { 'A': [[0, 0]], 'A+B': [[0, 0], [0, 1]], 'A+B+C': [[0, 0], [0, 1], [0, 2]], 'AxB': [[0, 0], [1, 0]], 'AxBxC': [[0, 0], [1, 0], [2, 0]], 'Ax(B+C)': [[0, 0.5], [1, 0], [1, 1]], 'AxB+C': [[0, 0], [1, 0], [1, 1]] };
  function goalPicHTML(goal, mini, act) {
    if (!goal || !goal.shape) return '';
    var lay = LAYOUT[goal.shape], rows = 1, cols = 1;
    lay.forEach(function (p) { rows = Math.max(rows, p[0] + 1); cols = Math.max(cols, Math.ceil(p[1] + 1)); });
    return '<div class="os-goalpic' + (mini ? ' mini' : '') + '" style="--r:' + rows + ';--c:' + cols + '">' + goal.digits.map(function (d, i) {
      var p = lay[i] || [0, i];
      return '<div class="gp" style="--y:' + p[0] + ';--x:' + p[1] + '">' + cubeHTML({ id: d.id, kind: 'digit', s: d.s, neg: d.neg }, mini ? 'mini' : '', act ? act : '') + '</div>';
    }).join('') + '</div>';
  }
  function shapeIcon(id) {
    var lay = LAYOUT[id];
    var rows = 1, cols = 1; lay.forEach(function (p) { rows = Math.max(rows, p[0] + 1); cols = Math.max(cols, Math.ceil(p[1] + 1)); });
    return '<span class="os-shape" style="--r:' + rows + ';--c:' + cols + '">' + lay.map(function (p, i) { return '<i style="--y:' + p[0] + ';--x:' + p[1] + '">' + 'ABC'.charAt(i) + '</i>'; }).join('') + '</span>';
  }

  // ======================= THE SET-NAME BUILDER =======================
  // OB = { title, universe, goal (number or null), pools: [{label, ids, req?, max?, forb?}], cubes (by id),
  //        mode, check(tokens) -> OSE.checkSolution result (or null in free practice), onDone(tokens|null, gaveUp),
  //        noGiveUp, extraBtn: {label, act},
  //        dock (3D: the builder sits at the side / bottom so the cards on the table stay in view),
  //        onLive(set | null, label) (3D: the cards of the set being built lift on the table, label = "R ∪ B: 7 cards") }
  var OB = null;
  function shell() {
    var el = document.getElementById('osB');
    if (!el) {
      el = document.createElement('div'); el.id = 'osB'; el.className = 'modal-back os-bk';
      el.innerHTML = '<div class="modal wide os-bbox" id="osBBox"></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  function openSetBuilder(cfg) {
    OB = cfg; OB.tokens = OB.tokens || [];
    var sh = shell(); sh.classList.toggle('os-dock', !!cfg.dock); sh.classList.add('on');
    if (Snd.getMood && Snd.getMood() !== 'off') Snd.setMood('think');
    renderSetBuilder();
  }
  function close() { var el = document.getElementById('osB'); if (el) el.classList.remove('on'); if (OB && OB.onLive) { try { OB.onLive(null, null); } catch (e) {} } OB = null; }
  function used() { var u = {}; OB.tokens.forEach(function (t) { if (typeof t === 'object') u[t.id] = 1; }); return u; }
  // the longest start of what he has built that already names a set (to light up while he is still building)
  function partial(tokens, uni) {
    for (var k = tokens.length; k > 0; k--) {
      var slice = tokens.slice(0, k), opens = 0;
      slice.forEach(function (t) { var s = OSE.symOf(t); if (s === '(') opens++; else if (s === ')') opens--; });
      while (opens-- > 0) slice.push(')');
      var ev = OSE.evaluate(slice, uni);
      if (ev.ok && !ev.ambiguous) return ev;
    }
    return null;
  }
  function renderSetBuilder() {
    if (!OB) return;
    var u = used(), uni = OB.universe, ev = OB.tokens.length ? OSE.evaluate(OB.tokens, uni) : null, lit = null, live, liveCls = '', cnt = null;
    var chk = OB.check ? OB.check(OB.tokens) : null;
    if (!OB.tokens.length) { live = 'Tap cubes to build a set. The cards in your set light up!'; liveCls = 'meh'; }
    else if (ev.ok && !ev.ambiguous) {
      lit = ev.set; var n = ev.count; cnt = n;
      live = 'card' + (n === 1 ? '' : 's') + ' in <b>' + esc(exprText(OB.tokens)) + '</b>';
      if (OB.goal != null) {
        if (n === OB.goal && (!chk || chk.ok)) { live += ' = the Goal!'; liveCls = 'good'; }
        else if (n === OB.goal) live += ': the right number! Now check the list below.';
        else live += ' (the Goal is ' + OB.goal + ')';
      }
    } else if (ev.ok) {
      var ks = Object.keys(ev.examples);
      live = 'This can be read two ways: ' + esc(ev.examples[ks[0]]) + ' (' + ks[0] + ') or ' + esc(ev.examples[ks[1]] || ev.examples[ks[0]]) + ' (' + (ks[1] || ks[0]) + '). Add ( ) to choose one.';
      liveCls = 'warn';
      if (ev.counts.length === 1) { cnt = ev.counts[0]; live = 'cards either way you read it' + (OB.goal != null && ev.counts[0] === OB.goal ? ' = the Goal!' : '') + '. ( ) make it clearer.'; liveCls = OB.goal != null && ev.counts[0] === OB.goal ? 'good' : ''; }
    } else {
      var pe = partial(OB.tokens, uni);
      if (pe) lit = pe.set;
      live = (ev.code === 'missing' || ev.code === 'paren') ? '…keep building' + (pe ? ' (so far: ' + pe.count + ' card' + (pe.count === 1 ? '' : 's') + ')' : '') : esc(ev.msg);
      liveCls = 'meh';
    }
    if (OB.onLive) {
      var lc = lit != null ? OSE.popcount(lit) : 0, what = ev && ev.ok && !ev.ambiguous ? exprText(OB.tokens) : 'so far';
      try { OB.onLive(lit, lit != null ? what + ': ' + lc + ' card' + (lc === 1 ? '' : 's') : null); } catch (e) {}
    }
    var checks = '';
    if (chk) {
      var reqIds = [], rq = 0;
      OB.pools.forEach(function (p) { if (p.req) reqIds = reqIds.concat(p.ids); });
      reqIds.forEach(function (id) { if (u[id]) rq++; });
      var items = [[OB.tokens.filter(OSE.isCubeTok).length >= 2, 'At least 2 cubes']];
      if (reqIds.length) items.push([rq === reqIds.length, 'All Required used (' + rq + '/' + reqIds.length + ')']);
      if (OB.mode === 'now') items.push([(chk.resUsed || 0) <= 1, 'At most 1 from Resources (' + (chk.resUsed || 0) + ')']);
      if (OB.goal != null) items.push([ev && ev.ok && ev.counts.length === 1 && ev.counts[0] === OB.goal, OB.goal + ' card' + (OB.goal === 1 ? '' : 's') + ', like the Goal']);
      checks = '<div class="checks">' + items.map(function (x) { return '<span class="' + (x[0] ? 'y' : 'n') + '">' + (x[0] ? '✔' : '○') + ' ' + x[1] + '</span>'; }).join('') + '</div>';
    }
    function trayKind(p) { return p.forb ? 'forb' : p.req ? 'req' : /Resources/.test(p.label) ? 'res' : 'perm'; }
    function plain(l) { return String(l).replace(/^[^A-Za-z]+/, ''); } // (labels may still start with an emoji)
    var pools = OB.pools.map(function (p) {
      if (!p.ids.length && !p.req) return '';
      var cu = p.ids.filter(function (id) { return u[id]; }).length, full = p.max && cu >= p.max;
      return '<div class="pool tray k-' + trayKind(p) + (p.forb ? ' forb' : '') + '"><h4><i class="tray-dot"></i>' + plain(p.label) + '</h4><div class="cubes">' + (p.ids.map(function (id) {
        var c = OB.cubes[id];
        return cubeHTML(c, 'mini' + (u[id] ? ' used' : '') + (full && !u[id] ? ' used' : ''), p.forb ? '' : 'osbAdd');
      }).join('') || '<span class="os-none">none</span>') + '</div></div>';
    }).join('');
    var goalLine = OB.goal != null ? '<div class="os-bgoal"><span class="rc-chip gold">' + ico('target') + ' Goal <b>' + OB.goal + '</b> card' + (OB.goal === 1 ? '' : 's') + '</span>' + (OB.goalPic || '') + '</div>' : '';
    $('#osBBox').innerHTML = '<h2 class="hero">' + OB.title + '</h2>' + (OB.note ? '<p class="os-note">' + OB.note + '</p>' : '') + goalLine +
      universeHTML(uni, lit, { small: true, cls: 'os-buni' }) +
      '<div class="os-plate"><div class="os-plate-h">' + ico('cube') + ' Your Set Name</div><div class="expr os-expr" id="osbExpr">' + (OB.tokens.length ? exprHTML(OB.tokens, OB.cubes, 'osbRemove') : '<span class="os-hint">tap cubes below…</span>') + '</div>' +
      '<div class="b-tools"><button class="btn small" data-act="osbParen" data-arg="(" aria-label="Open bracket">(</button><button class="btn small" data-act="osbParen" data-arg=")" aria-label="Close bracket">)</button><button class="btn small" data-act="osbBack" aria-label="Take back the last one">⌫</button><button class="btn small quiet" data-act="osbClear">Clear</button></div></div>' +
      '<div class="os-count ' + liveCls + '" aria-live="polite"><span class="oc-n">' + (cnt == null ? '·' : cnt) + '</span><span class="oc-t">' + live + '</span></div>' + checks +
      '<div class="os-trays">' + pools + '</div>' +
      '<div class="row os-brow"><button class="btn big green" data-act="osbSubmit">' + ico('check') + ' ' + (OB.submitLabel || 'Check my Solution!') + '</button>' +
      (OB.noGiveUp ? '' : '<button class="btn quiet" data-act="osbGiveUp">' + (OB.giveUpLabel || 'I can\'t find one') + '</button>') + (OB.extraBtn ? '<button class="btn quiet" data-act="' + OB.extraBtn.act + '">' + OB.extraBtn.label + '</button>' : '') + '</div>' +
      '<p class="os-tip">Tip: tap a cube in your Set Name to take it back out. ′ goes right after a set, like G′.</p>';
  }
  ACT.osbAdd = function (el) {
    if (!OB) return;
    var id = +el.dataset.arg, u = used();
    if (u[id]) return;
    var pool = OB.pools.find(function (p) { return p.ids.indexOf(id) >= 0; });
    if (!pool || pool.forb) return;
    if (pool.max && pool.ids.filter(function (x) { return u[x]; }).length >= pool.max) { Snd.boop(); return; }
    OB.tokens.push({ s: OB.cubes[id].s, id: id }); Snd.click(); renderSetBuilder();
  };
  ACT.osbRemove = function (el) { if (!OB) return; OB.tokens.splice(+el.dataset.bi, 1); Snd.click(); renderSetBuilder(); };
  ACT.osbParen = function (el) { if (!OB) return; OB.tokens.push(el.dataset.arg); Snd.click(); renderSetBuilder(); };
  ACT.osbBack = function () { if (!OB) return; OB.tokens.pop(); Snd.click(); renderSetBuilder(); };
  ACT.osbClear = function () { if (!OB) return; OB.tokens = []; renderSetBuilder(); };
  ACT.osbSubmit = function () {
    if (!OB) return;
    if (!OB.tokens.length) { Snd.boop(); return; }
    var b = OB; close(); b.onDone(b.tokens.slice(), false);
  };
  ACT.osbGiveUp = function () { if (!OB) return; var b = OB; close(); b.onDone(null, true); };

  // ======================= THE GOAL BUILDER =======================
  // GB = { universe, digits: [cube], onDone({shape, digits:[{id,s,neg}]}, value), onCancel }
  var GB = null;
  function openGoalBuilder(cfg) {
    GB = cfg; GB.picked = []; GB.shape = null;
    var sh = shell(); sh.classList.toggle('os-dock', !!cfg.dock); sh.classList.add('on');
    if (Snd.getMood && Snd.getMood() !== 'off') Snd.setMood('think'); // the music leans in while he builds
    renderGoalBuilder();
  }
  function goalNow() {
    var n = GB.picked.length;
    var shapes = OSE.SHAPES.filter(function (sh) { return sh.n === n; });
    if (!GB.shape || OSE.SHAPE[GB.shape].n !== n) GB.shape = shapes.length ? shapes[0].id : null;
    return { shape: GB.shape, digits: GB.picked.map(function (p) { return { id: p.id, s: p.s, neg: p.neg }; }) };
  }
  function renderGoalBuilder() {
    if (!GB) return;
    var g = goalNow(), n = GB.picked.length, live = 'Tap 1, 2 or 3 digit cubes.', cls = 'meh', okGoal = false, num = null;
    if (n) {
      var v = OSE.goalValue(g);
      if (v.ok) {
        num = v.value;
        live = 'for <b>' + esc(OSE.goalText(g)) + '</b>';
        if (v.value < 0) { live += '. That is below zero: no set can have fewer than 0 cards!'; cls = 'warn'; }
        else if (v.value > GB.universe.length) { live += '. There are only ' + GB.universe.length + ' cards, so no set could have that many.'; cls = 'warn'; }
        else { live = 'card' + (v.value === 1 ? '' : 's') + ' for <b>' + esc(OSE.goalText(g)) + '</b>. A Solution must name a set with exactly ' + v.value + '.'; cls = 'good'; okGoal = true; }
      }
    }
    var shapes = OSE.SHAPES.filter(function (sh) { return sh.n === n; });
    var pickedIds = {}; GB.picked.forEach(function (p) { pickedIds[p.id] = 1; });
    $('#osBBox').innerHTML = '<h2 class="hero">' + (GB.title || 'Set the Goal') + '</h2>' +
      '<p class="os-note">The Goal is a number of cards. <b>Side by side</b> adds. <b>Stacked</b> multiplies. Tap a placed cube to turn it upside down (negative).</p>' +
      universeHTML(GB.universe, null, { small: true, cls: 'os-buni' }) +
      '<div class="os-plate"><div class="os-plate-h">' + ico('target') + ' Your Goal</div><div class="os-gbwrap">' + (n ? goalPicHTML(g, false, 'osgFlip') : '<span class="os-hint">no cubes yet</span>') + '</div>' +
      (shapes.length > 1 ? '<div class="os-shapes">' + shapes.map(function (sh) { return '<button class="btn small' + (sh.id === GB.shape ? ' on' : '') + '" data-act="osgShape" data-arg="' + sh.id + '">' + shapeIcon(sh.id) + ' ' + esc(sh.label) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="b-tools"><button class="btn small" data-act="osgBack" aria-label="Take back the last one">⌫</button><button class="btn small quiet" data-act="osgClear">Clear</button></div></div>' +
      '<div class="os-count ' + cls + '" aria-live="polite"><span class="oc-n">' + (num == null ? '·' : num) + '</span><span class="oc-t">' + live + '</span></div>' +
      '<div class="os-trays"><div class="pool tray k-res"><h4><i class="tray-dot"></i>Digit cubes in Resources</h4><div class="cubes">' + GB.digits.map(function (c) { return cubeHTML(c, 'mini' + (pickedIds[c.id] ? ' used' : ''), 'osgAdd'); }).join('') + '</div></div></div>' +
      '<div class="row os-brow"><button class="btn big green" data-act="osgSubmit"' + (okGoal ? '' : ' disabled') + '>' + ico('target') + ' Set this Goal!</button>' + (GB.onCancel ? '<button class="btn quiet" data-act="osgCancel">Back</button>' : '') + '</div>';
  }
  ACT.osgAdd = function (el) {
    if (!GB) return; var id = +el.dataset.arg;
    if (GB.picked.some(function (p) { return p.id === id; }) || GB.picked.length >= 3) { Snd.boop(); return; }
    var c = GB.digits.find(function (x) { return x.id === id; }); GB.picked.push({ id: id, s: c.s, neg: false }); Snd.click(); renderGoalBuilder();
  };
  ACT.osgFlip = function (el) { if (!GB) return; var id = +el.dataset.arg, p = GB.picked.find(function (x) { return x.id === id; }); if (p) { p.neg = !p.neg; if (!cardSnd('flip')) Snd.click(); renderGoalBuilder(); } };
  ACT.osgShape = function (el) { if (!GB) return; GB.shape = el.dataset.arg; Snd.click(); renderGoalBuilder(); };
  ACT.osgBack = function () { if (!GB) return; GB.picked.pop(); renderGoalBuilder(); };
  ACT.osgClear = function () { if (!GB) return; GB.picked = []; renderGoalBuilder(); };
  ACT.osgCancel = function () { if (!GB) return; var g = GB; GB = null; close(); if (g.onCancel) g.onCancel(); };
  ACT.osgSubmit = function () {
    if (!GB) return; var g = goalNow(), v = OSE.goalValue(g);
    if (!v.ok || v.value < 0 || v.value > GB.universe.length) { Snd.boop(); return; }
    var b = GB; GB = null; close(); b.onDone(g, v.value);
  };
  function builderOpen() { return !!OB || !!GB; }
  function closeAll() { GB = null; close(); }

  return { cardSnd: cardSnd, cardHTML: cardHTML, universeHTML: universeHTML, cubeHTML: cubeHTML, faceHTML: faceHTML, exprHTML: exprHTML, exprText: exprText, goalPicHTML: goalPicHTML, shapeIcon: shapeIcon,
    openSetBuilder: openSetBuilder, openGoalBuilder: openGoalBuilder, builderOpen: builderOpen, closeAll: closeAll, rerender: function () { if (OB) renderSetBuilder(); else if (GB) renderGoalBuilder(); } };
})();
