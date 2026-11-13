'use strict';
// ======================= ON-SETS: TUTORIAL + DRILLS =======================
// The tutorial teaches what a set is with a tiny Universe of five cards, one idea per step, and ends with the kid
// building a set of exactly 2 cards. Drills are solver-made and never run out; no timers, no streaks to lose:
// three right in a row moves a drill up a level, two misses move it down one.
var OT = null, ODR = null;

function osHdr(title, back) {
  return '<div class="hdr os-hdr"><button class="btn small ghost" data-act="' + back + '" aria-label="Back">' + ico('back') + '<span class="lbl">Back</span></button><h2>' + title + '</h2></div>';
}
function osBubble(text, mood) { return '<div class="os-say">' + pipHTML(mood || 'happy', 64, '') + '<div class="bubble">' + text + '</div></div>'; }
function osToks(str) { return str.split(''); }

// ======================= TUTORIAL =======================
var OT_UNI = [1, 2, 3, 4, 0]; // B, R, BR, G, blank
var OT_STEPS = [
  { t: 'info', h: 'What is a set?', p: 'In On-Sets you play with <b>cards</b>. Each card has coloured dots: <b class="os-w-B">blue</b>, <b class="os-w-R">red</b>, <b class="os-w-G">green</b> or <b class="os-w-Y">yellow</b>. Some have two or three. One card has no dots at all: the <b>blank</b> card.<br><br>The cards on the table are called the <b>Universe</b>. Here is a tiny one with 5 cards.' },
  { t: 'pick', e: 'B', h: 'A colour cube names a set', p: 'The blue cube means <b>every card with a blue dot</b>. A group of cards like that is called a <b>set</b>.<br>Tap every card that is in this set, then tap <b>Check</b>.', why: 'every card with a blue dot' },
  { t: 'pick', e: 'BUR', h: '∪ means OR', p: '<b>B ∪ R</b> (say "B union R") means cards with blue <b>OR</b> red. A card with both counts too!', why: 'cards with blue OR red (or both)' },
  { t: 'pick', e: 'BIR', h: '∩ means AND', p: '<b>B ∩ R</b> (say "B intersect R") means cards with blue <b>AND</b> red, both on the same card.', why: 'cards with blue AND red' },
  { t: 'pick', e: 'B-R', h: '− means take away', p: '<b>B − R</b> (say "B minus R") means the blue cards, but <b>take away</b> any card with red.', why: 'blue cards without red' },
  { t: 'pick', e: "R'", h: '′ means NOT', p: '<b>R′</b> (say "R prime" or "not R") means every card with <b>NO</b> red dot. Don\'t forget the blank card!', why: 'cards with no red dot' },
  { t: 'pick', e: 'V', h: 'V and Λ', p: '<b>V</b> means <b>every</b> card in the Universe. <b>Λ</b> means <b>no cards at all</b>. Tap all the cards in V.', why: 'every card' },
  { t: 'build', h: 'Now you name a set!', p: 'In the game, the <b>Goal</b> is a number of cards. Build a set with exactly <b>2 cards</b>. Watch the cards light up as you build!', goal: 2 },
  { t: 'info', h: 'How a game goes', p: '<ul class="reasons os-rules"><li>The cubes are rolled and some cards are dealt. One player sets the <b>Goal</b>: a number of cards.</li><li>Players take turns moving one cube to <b>Required</b> (must be used), <b>Permitted</b> (may be used) or <b>Forbidden</b> (can\'t be used).</li><li>A <b>Solution</b> names a set with exactly the Goal\'s number of cards.</li><li><b>' + ico('bolt') + ' Now!</b> = "I can name it right now, with at most one more cube." <b>' + ico('ban') + ' Impossible!</b> = "Nobody can ever name it with these cubes."</li><li>Correct scores 6 (or 4 after the last cube). Not correct scores 2. Everybody always scores something!</li></ul>', last: true }
];
function osStartTutorial() { OT = { step: 0, picked: {}, done: false, tries: 0, showed: false }; Onsets.view = 'tut'; go('onsets'); osRenderTut(); }
// the Universe on its felt (dark navy plate with a label), used by the tutorial and the drills
function osFelt(universe, set, opts) {
  return '<div class="os-felt"><div class="os-plate-h">' + ico('cube') + ' Universe <span>' + universe.length + ' cards</span></div>' + OSUI.universeHTML(universe, set, opts || {}) + '</div>';
}
function osPlate(title, inner) { return '<div class="os-plate"><div class="os-plate-h">' + ico('cube') + ' ' + title + '</div>' + inner + '</div>'; }
function osRenderTut() {
  if (!OT) return;
  var st = OT_STEPS[OT.step], body = '', set = null, ev = null, n = OT_STEPS.length;
  if (st.e) { ev = OSE.evaluate(osToks(st.e), OT_UNI); set = ev.set; }
  if (st.t === 'info') {
    var four = OT.step === 0 ? '<div class="os-felt os-four">' + ['B', 'R', 'G', 'Y'].map(function (c) { return OSUI.cubeHTML({ s: c }, ''); }).join('') + '</div>' : '';
    body = (st.last ? '<div class="os-tutp">' + st.p + '</div>' : osBubble(st.p, 'happy')) + (OT.step === 0 ? osFelt(OT_UNI, null, {}) + four : '') +
      '<div class="row"><button class="btn big green" data-act="' + (st.last ? 'osTutFinish' : 'osTutNext') + '">' + (st.last ? 'Let\'s play! ' : 'Next ') + ico('play') + '</button></div>';
  } else if (st.t === 'pick') {
    var showSet = OT.done || OT.showed;
    body = osBubble(st.p, 'happy') + osPlate('Set Name', '<div class="expr os-expr big">' + OSUI.exprHTML(osToks(st.e)) + '</div>') +
      osFelt(OT_UNI, showSet ? set : null, OT.done ? {} : { act: 'osTutPick', picked: OT.picked, noDim: true }) +
      (OT.msg ? osBubble(OT.msg, OT.done ? 'cheer' : 'think') : '') +
      '<div class="row">' + (OT.done ? '<button class="btn big green" data-act="osTutNext">Next ' + ico('play') + '</button>'
        : '<button class="btn big green" data-act="osTutCheck">' + ico('check') + ' Check</button>' + (OT.tries ? '<button class="btn quiet" data-act="osTutShow">Show me</button>' : '')) + '</div>';
  } else if (st.t === 'build') {
    body = osBubble(st.p, 'happy') + osFelt(OT_UNI, OT.lastSet != null ? OT.lastSet : null, {}) + (OT.msg ? osBubble(OT.msg, OT.done ? 'cheer' : 'think') : '') +
      '<div class="row">' + (OT.done ? '<button class="btn big green" data-act="osTutNext">Next ' + ico('play') + '</button>' : '<button class="btn big green" data-act="osTutBuild">' + ico('pencil') + ' Build a set</button>') + '</div>';
  }
  $('#onsets').innerHTML = osHdr('How to play On-Sets', 'osTutQuit') + '<div class="panel os-panel os-tut"><div class="os-steps" role="img" aria-label="Step ' + (OT.step + 1) + ' of ' + n + '">' + OT_STEPS.map(function (s, i) { return '<i class="' + (i < OT.step ? 'done' : i === OT.step ? 'now' : '') + '"></i>'; }).join('') + '<span>Step ' + (OT.step + 1) + ' of ' + n + '</span></div><h3>' + st.h + '</h3>' + body + '</div>';
}
ACT.osTutPick = function (el) { if (!OT || OT.done) return; var i = +el.dataset.arg; if (OT.picked[i]) delete OT.picked[i]; else OT.picked[i] = 1; if (!OSUI.cardSnd(OT.picked[i] ? 'lift' : 'place')) Snd.click(); OT.msg = ''; osRenderTut(); };
ACT.osTutCheck = function () {
  if (!OT) return;
  var st = OT_STEPS[OT.step], set = OSE.evaluate(osToks(st.e), OT_UNI).set, extra = 0, missing = 0;
  OT_UNI.forEach(function (c, i) { var inS = (set & (1 << i)) !== 0; if (OT.picked[i] && !inS) extra++; if (!OT.picked[i] && inS) missing++; });
  if (!extra && !missing) {
    var n = OSE.popcount(set); OT.done = true; Snd.chime();
    OT.msg = 'Yes! ' + OSUI.exprText(osToks(st.e)) + ' is ' + st.why + ': <b>' + n + ' card' + (n === 1 ? '' : 's') + '</b>.';
  } else {
    OT.tries++; Snd.boop();
    var bits = [];
    if (extra) bits.push(extra + ' of your cards ' + (extra === 1 ? 'isn\'t' : 'aren\'t') + ' in the set');
    if (missing) bits.push(missing + ' card' + (missing === 1 ? ' is' : 's are') + ' missing');
    OT.msg = 'Almost! ' + bits.join(', and ') + '. Remember: ' + st.why + '.';
  }
  osRenderTut();
};
ACT.osTutShow = function () { if (!OT) return; OT.showed = true; OT.msg = 'These cards light up. Tap the same ones, then Check!'; osRenderTut(); };
ACT.osTutNext = function () { if (!OT) return; OT.step = Math.min(OT_STEPS.length - 1, OT.step + 1); OT.picked = {}; OT.done = false; OT.msg = ''; OT.tries = 0; OT.showed = false; OT.lastSet = null; Snd.click(); osRenderTut(); };
ACT.osTutBuild = function () {
  if (!OT) return;
  var syms = ['B', 'R', 'G', 'U', 'I', '-', "'", 'V', 'N'], cubes = syms.map(function (s, i) { return { id: i, kind: OSE.kindOf(s), s: s }; });
  var ctx = { universe: OT_UNI, goal: 2, mode: 'free', zone: function () { return 'permitted'; }, required: [] };
  OSUI.openSetBuilder({ title: 'Build a set with 2 cards', universe: OT_UNI, goal: 2, pools: [{ label: 'Your cubes (use any)', ids: cubes.map(function (c) { return c.id; }) }], cubes: cubes, mode: 'free',
    check: function (t) { return OSE.checkSolution(t, ctx); }, giveUpLabel: 'Help me', submitLabel: 'Check my set!',
    onDone: function (tokens) {
      if (!OT) return;
      if (!tokens) { OT.msg = 'Here\'s one idea: <b>B − G</b>. That\'s the blue cards without green. Try building it!'; osRenderTut(); return; }
      var chk = OSE.checkSolution(tokens, ctx), ev = OSE.evaluate(tokens, OT_UNI);
      OT.lastSet = ev.ok && !ev.ambiguous ? ev.set : null;
      if (chk.ok) { OT.done = true; Snd.chime(); if (window.FX) FX.confetti(50); OT.msg = 'You did it! ' + esc(OSUI.exprText(tokens)) + ' has exactly 2 cards. That is a <b>Solution</b>!'; }
      else { Snd.boop(); OT.msg = esc(chk.reasons[0] || 'Not quite.') + ' Try again!'; }
      osRenderTut();
    } });
};
ACT.osTutFinish = function () {
  var st = osState(), first = !st.tutorialDone; st.tutorialDone = true; persist();
  if (first) osStar('Finished the On-Sets tutorial!');
  OT = null; if (window.victoryFX) victoryFX(); Onsets.open();
};
ACT.osTutQuit = function () { OT = null; OSUI.closeAll(); Onsets.open(); };

// ======================= DRILLS =======================
var OS_DRILLS = [
  { id: 'count', ic: 'chart', name: 'How many cards?', blurb: 'Count the cards in a set.', color: '#4dabf7' },
  { id: 'name', ic: 'bulb', name: 'Name this set', blurb: 'Which set lights up these cards?', color: '#f5b400' },
  { id: 'find', ic: 'target', name: 'Make the Goal', blurb: 'Build a set with exactly that many cards.', color: '#22b573' },
  { id: 'now', ic: 'bolt', name: 'Now or not yet?', blurb: 'Could you name it right now?', color: '#ff8a1f' }
];
function osDrillState(id) { var d = osState().drills; if (!d[id]) d[id] = { lvl: 1, row: 0, miss: 0, done: 0 }; return d[id]; }
function osDrillResult(id, ok) {
  var c = osDrillState(id), st = osState(), note = '';
  if (ok) { c.done++; c.row++; c.miss = 0; st.row = (st.row || 0) + 1; if (c.row >= 3 && c.lvl < 5) { c.lvl++; c.row = 0; note = 'Level up! This drill is now level ' + c.lvl + '.'; } }
  else { c.row = 0; c.miss++; st.row = 0; if (c.miss >= 2 && c.lvl > 1) { c.lvl--; c.miss = 0; note = 'Let\'s practise a slightly easier one next.'; } }
  persist();
  if (ok && st.row >= 3) { st.row = 0; persist(); osStar('3 right in a row in the drills!'); }
  return note;
}
function osRand() { return OSE.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0); }
function osPickN(arr, n, rand) { return OSE.shuffle(arr.slice(), rand).slice(0, n); }
// A Set-Name for a drill, by level (token symbols).
function osDrillExpr(L, rand) {
  var c = osPickN(OSE.COLORS, 3, rand), X = c[0], Y = c[1], Z = c[2], r = rand();
  if (L <= 1) return r < 0.8 ? [X] : [X, "'"];
  if (L === 2) return r < 0.5 ? [X, 'U', Y] : [X, 'I', Y];
  if (L === 3) return r < 0.35 ? [X, '-', Y] : r < 0.6 ? [X, "'"] : r < 0.8 ? [X, 'U', Y] : [X, 'I', Y];
  if (L === 4) return r < 0.25 ? ['(', X, 'U', Y, ')', '-', Z] : r < 0.5 ? [X, "'", 'I', Y] : r < 0.75 ? [X, 'I', Y, "'"] : ['(', X, 'I', Y, ')', 'U', Z];
  return r < 0.2 ? ['(', X, 'U', Y, ')', "'"] : r < 0.4 ? [X, '-', '(', Y, 'I', Z, ')'] : r < 0.6 ? ['(', X, 'I', Y, ')', 'U', Z, "'"] : r < 0.8 ? ['(', X, '-', Y, ')', 'U', '(', Z, '-', X, ')'] : ['V', '-', '(', X, 'U', Y, ')'];
}
function osDrillUni(L, rand) { return OSE.deal(Math.min(12, 5 + L + Math.floor(rand() * 3)), rand); }
function osMakeDrill(id) {
  var L = osDrillState(id).lvl, rand = osRand();
  for (var tries = 0; tries < 80; tries++) {
    var U = osDrillUni(L, rand);
    if (id === 'count') {
      var e = osDrillExpr(L, rand), ev = OSE.evaluate(e, U);
      if (!ev.ok || ev.ambiguous) continue;
      if ((ev.count === 0 || ev.count === U.length) && tries < 60) continue;
      return { id: id, U: U, e: e, answer: ev.count, set: ev.set };
    }
    if (id === 'name') {
      var e1 = osDrillExpr(L, rand), s1 = OSE.evaluate(e1, U);
      if (!s1.ok || s1.count === 0 || s1.count === U.length) continue;
      var opts = [{ e: e1, set: s1.set }], guard = 0;
      while (opts.length < 3 && guard++ < 60) {
        var e2 = osDrillExpr(Math.max(1, L - (rand() < 0.3 ? 1 : 0)), rand), s2 = OSE.evaluate(e2, U);
        if (s2.ok && opts.every(function (o) { return o.set !== s2.set; })) opts.push({ e: e2, set: s2.set });
      }
      if (opts.length < 3) continue;
      return { id: id, U: U, set: s1.set, opts: OSE.shuffle(opts, rand), answer: s1.set };
    }
    if (id === 'find') {
      var ops = L <= 1 ? ['U', 'I'] : L === 2 ? ['U', 'I', '-'] : ['U', 'I', '-', "'"], cols = osPickN(OSE.COLORS, L <= 2 ? 3 : 4, rand);
      var pool = cols.concat(ops).concat(L >= 4 ? ['V', 'N'] : []);
      var goal = Math.floor(rand() * (U.length + 1));
      var sv = OSE.solve({ universe: U, goal: goal, req: [], perm: pool, res: [], mode: 'free', maxCubes: L <= 2 ? 3 : L <= 4 ? 5 : 7, timeMs: 400 });
      if (!sv.found) continue;
      if (sv.cubes < (L >= 3 ? 3 : 2) && tries < 50) continue;
      var cubes = pool.map(function (s, i) { return { id: i, kind: OSE.kindOf(s), s: s }; });
      return { id: id, U: U, goal: goal, cubes: cubes, sample: sv.tokens };
    }
    if (id === 'now') {
      var all = OSE.roll(rand).filter(function (c) { return c.kind !== 'digit'; }), sh = OSE.shuffle(all.slice(), rand);
      var nr = L >= 3 ? 1 : 0, np = 1 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0), nres = 3 + (L >= 5 ? 1 : 0);
      var req = sh.slice(0, nr), perm = sh.slice(nr, nr + np), res = sh.slice(nr + np, nr + np + nres);
      var st = { req: req.map(function (c) { return c.s; }), perm: perm.map(function (c) { return c.s; }), res: res.map(function (c) { return c.s; }) };
      var g = Math.floor(rand() * (U.length + 1)), target = rand() < 0.5;
      var r = OSE.solve({ universe: U, goal: g, req: st.req, perm: st.perm, res: st.res, mode: 'now', timeMs: 400 });
      if (!r.complete && !r.found) continue;
      if (r.found !== target && tries < 70) continue;
      var later = r.found ? null : OSE.solve({ universe: U, goal: g, req: st.req, perm: st.perm, res: st.res, mode: 'impossible', timeMs: 400 });
      return { id: id, U: U, goal: g, req: req, perm: perm, res: res, answer: r.found, sample: r.found ? r.tokens : (later && later.found ? later.tokens : null) };
    }
  }
  return null;
}
function osOpenDrills() { ODR = null; Onsets.view = 'drills'; go('onsets'); osRenderDrills(); }
function osPips(lvl) { var h = ''; for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= lvl ? 'on' : '') + '"></i>'; return '<span class="os-pips" role="img" aria-label="Level ' + lvl + ' of 5">' + h + '</span>'; }
function osRenderDrills() {
  $('#onsets').innerHTML = osHdr('Set Drills', 'osHome') + '<div class="panel os-panel">' + osBubble('Pick a drill! No timers. Three right in a row moves a drill up a level.') +
    '<div class="os-drills">' + OS_DRILLS.map(function (d) { var s = osDrillState(d.id); return '<button class="os-drillcard" style="--dc:' + d.color + '" data-act="osDrill" data-arg="' + d.id + '"><span class="os-dband"><span class="os-di">' + ico(d.ic) + '</span></span><b>' + d.name + '</b><small>' + d.blurb + '</small><span class="os-lvl">' + osPips(s.lvl) + '<em>Level ' + s.lvl + ' · ' + s.done + ' done</em></span></button>'; }).join('') + '</div></div>';
}
ACT.osDrill = function (el) { osStartDrill(el.dataset.arg); };
function osStartDrill(id) {
  var P = osMakeDrill(id);
  if (!P) { osToast('Hmm, let me shuffle again…'); P = osMakeDrill(id); }
  if (!P) return;
  ODR = { P: P, answered: false, msg: '', picked: null }; Onsets.view = 'drill'; go('onsets'); osRenderDrill();
}
function osRenderDrill() {
  if (!ODR) return;
  var P = ODR.P, d = OS_DRILLS.find(function (x) { return x.id === P.id; }), s = osDrillState(P.id), body = '';
  if (P.id === 'count') {
    body = '<p class="os-q">How many cards are in</p><div class="expr os-expr big">' + OSUI.exprHTML(P.e) + '</div>' +
      osFelt(P.U, ODR.answered ? P.set : null, {}) +
      '<div class="row os-nums">' + P.U.map(function (c, i) { return i; }).concat([P.U.length]).map(function (n) { return '<button class="btn' + (ODR.answered && n === P.answer ? ' green' : ODR.answered && n === ODR.picked ? ' pink' : '') + '" data-act="osDCount" data-arg="' + n + '"' + (ODR.answered ? ' disabled' : '') + '>' + n + '</button>'; }).join('') + '</div>';
  } else if (P.id === 'name') {
    body = '<p class="os-q">Which set is lit up?</p>' + osFelt(P.U, P.set, {}) +
      '<div class="os-opts">' + P.opts.map(function (o, i) { var right = o.set === P.answer, cls = ODR.answered ? (right ? ' green' : i === ODR.picked ? ' pink' : '') : ''; return '<button class="btn os-opt' + cls + '" data-act="osDName" data-arg="' + i + '"' + (ODR.answered ? ' disabled' : '') + '><span class="expr os-expr">' + OSUI.exprHTML(o.e) + '</span></button>'; }).join('') + '</div>' +
      (ODR.answered && ODR.picked != null && P.opts[ODR.picked].set !== P.answer ? '<p class="os-q">Your pick, ' + esc(OSUI.exprText(P.opts[ODR.picked].e)) + ', names these cards:</p>' + OSUI.universeHTML(P.U, P.opts[ODR.picked].set, { small: true }) : '');
  } else if (P.id === 'find') {
    body = '<p class="os-q">Make a set with exactly <b>' + P.goal + '</b> card' + (P.goal === 1 ? '' : 's') + '.</p>' + osFelt(P.U, ODR.lit != null ? ODR.lit : null, {}) +
      '<div class="pool"><h4>Your cubes</h4><div class="cubes">' + P.cubes.map(function (c) { return OSUI.cubeHTML(c, 'mini'); }).join('') + '</div></div>' +
      (ODR.answered ? '' : '<div class="row"><button class="btn big green" data-act="osDFind">' + ico('pencil') + ' Build it</button></div>');
  } else if (P.id === 'now') {
    var row = function (lab, list) { return '<div class="os-minirow"><b>' + lab + '</b><span>' + (list.map(function (c) { return OSUI.cubeHTML(c, 'mini'); }).join('') || '<i>empty</i>') + '</span></div>'; };
    body = '<p class="os-q">The Goal is <b>' + P.goal + '</b> card' + (P.goal === 1 ? '' : 's') + '. Could someone name a set with ' + P.goal + ' card' + (P.goal === 1 ? '' : 's') + ' RIGHT NOW, using all of Required, any of Permitted, and at most ONE Resource cube?</p>' +
      osFelt(P.U, ODR.lit != null ? ODR.lit : null, {}) +
      '<div class="os-minimat">' + row('<i class="td rq"></i>Required', P.req) + row('<i class="td pm"></i>Permitted', P.perm) + row('<i class="td rs"></i>Resources', P.res) + '</div>' +
      (ODR.answered ? '' : '<div class="row"><button class="btn now" data-act="osDNow" data-arg="1">' + ico('bolt') + ' Yes, Now!</button><button class="btn" data-act="osDNow" data-arg="0">Not yet</button></div>');
  }
  $('#onsets').innerHTML = osHdr(ico(d.ic) + ' ' + d.name, 'osDrillsBack') + '<div class="panel os-panel os-drill"><div class="os-lvlchip">' + osPips(s.lvl) + ' Level ' + s.lvl + '</div>' + body +
    (ODR.msg ? osBubble(ODR.msg, ODR.good ? 'cheer' : 'think') : '') +
    (ODR.answered ? '<div class="row"><button class="btn big green" data-act="osDNext">Next one ' + ico('play') + '</button></div>' : '') + '</div>';
}
function osDrillDone(ok, msg) {
  var note = osDrillResult(ODR.P.id, ok);
  ODR.answered = true; ODR.good = ok; ODR.msg = msg + (note ? ' <b>' + note + '</b>' : '');
  if (ok) Snd.chime(); else Snd.boop();
  osRenderDrill();
}
ACT.osDCount = function (el) {
  if (!ODR || ODR.answered) return; var n = +el.dataset.arg, P = ODR.P; ODR.picked = n;
  osDrillDone(n === P.answer, (n === P.answer ? 'Yes! ' : 'Good try! ') + esc(OSUI.exprText(P.e)) + ' has <b>' + P.answer + '</b> card' + (P.answer === 1 ? '' : 's') + '. They are lit up.');
};
ACT.osDName = function (el) {
  if (!ODR || ODR.answered) return; var i = +el.dataset.arg, P = ODR.P, ok = P.opts[i].set === P.answer; ODR.picked = i;
  var right = P.opts.find(function (o) { return o.set === P.answer; });
  osDrillDone(ok, ok ? 'Yes! ' + esc(OSUI.exprText(right.e)) + ' names exactly those cards.' : 'Good try! The lit cards are ' + esc(OSUI.exprText(right.e)) + '.');
};
ACT.osDNow = function (el) {
  if (!ODR || ODR.answered) return; var yes = el.dataset.arg === '1', P = ODR.P, ok = yes === P.answer;
  if (P.sample) { var ev = OSE.evaluate(P.sample, P.U); ODR.lit = ev.set; }
  var how = P.sample ? ' For example ' + esc(OSUI.exprText(P.sample)) + ' (lit up).' : '';
  osDrillDone(ok, P.answer ? (ok ? 'Yes! It can be named right now.' : 'It can be named right now!') + how : (ok ? 'Right, not yet!' : 'Not yet: no set with ' + P.goal + ' cards can be named with these cubes and just one more.') + (P.sample ? ' It needs more cubes, like ' + esc(OSUI.exprText(P.sample)) + '.' : ' In fact no set with these cubes has that many cards.'));
};
ACT.osDFind = function () {
  if (!ODR || ODR.answered) return; var P = ODR.P;
  var ctx = { universe: P.U, goal: P.goal, mode: 'free', zone: function () { return 'permitted'; }, required: [] };
  OSUI.openSetBuilder({ title: 'Make a set with ' + P.goal + ' card' + (P.goal === 1 ? '' : 's'), universe: P.U, goal: P.goal, pools: [{ label: 'Your cubes (use any)', ids: P.cubes.map(function (c) { return c.id; }) }], cubes: P.cubes, mode: 'free',
    check: function (t) { return OSE.checkSolution(t, ctx); }, giveUpLabel: 'Show me one', submitLabel: 'Check my set!',
    onDone: function (tokens) {
      if (!ODR) return;
      var ev2 = OSE.evaluate(P.sample, P.U);
      if (!tokens) { ODR.lit = ev2.set; osDrillDone(false, 'Here is one way: ' + esc(OSUI.exprText(P.sample)) + ' (lit up). Next time you\'ll find one!'); return; }
      var chk = OSE.checkSolution(tokens, ctx), ev = OSE.evaluate(tokens, P.U);
      ODR.lit = ev.ok && !ev.ambiguous ? ev.set : null;
      if (chk.ok) osDrillDone(true, 'Yes! ' + esc(OSUI.exprText(tokens)) + ' has exactly ' + P.goal + ' card' + (P.goal === 1 ? '' : 's') + '.');
      else { ODR.msg = esc(chk.reasons[0] || 'Not quite.') + ' Have another go!'; ODR.good = false; Snd.boop(); osRenderDrill(); }
    } });
};
ACT.osDNext = function () { if (!ODR) return; osStartDrill(ODR.P.id); };
ACT.osDrillsBack = function () { OSUI.closeAll(); osOpenDrills(); };
