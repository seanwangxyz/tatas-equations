'use strict';
// ======================= RIVALS: creatures that remember =======================
// Every creature keeps a small memory of its matches with him (S.rivals, keyed by creature id) and talks about it:
// "Last time you beat me with a factorial!", "That's 3 in a row… I need a stronger pillow."
//
// Save shape (S.rivals[o.id]), about 300-500 bytes per creature, 15 creatures at most (Rivals.bytes() reports it):
//   n, w, l, t   matches played / won by him / lost / tied (every mode with a creature at the table except online)
//   st           streak: +3 = he won the last 3, -2 = the creature won the last 2, 0 = last was a tie
//   bs           his best win streak against this creature
//   f, d         first and last day played ('YYYY-MM-DD')
//   r            the last 5 results, most recent first: [res 'w'|'l'|'t', his score, its score, day, mode]
//                mode: 'a' one-on-one, 'c' Cup round, '3' Three at the table, 'm' Team-up, 'p' 3 players
//   last         how the last match was decided: {how: 'now'|'imp'|'other', who: 'k'|'o' (whose shake decided it),
//                it: [kind, value] the thing that decided it (kind 'op' + − × ÷ ^ √ !, 'b' gold Power-die face,
//                'g' purple Big-number face, 'v' variation card id), sol: his Solution text, osol: the creature's,
//                cb: 1 comeback from behind, pf: 1 he scored on every shake, k: [skill keys he used in this match]}
//   big          his biggest Goal against it: [value, text]
//   adm          the Solution it admired most: [kind 'long'|'frac'|'neg', text, score]
//   ms           milestones (day each happened): fw first win, w5 / w10 5th / 10th win, cb comeback, pf perfect,
//                cup: [day, round] (won a Cup round against it), tr: Three-at-the-table crown with it at the table
//   sea          [his place in the season table, league id, day] after the last league fixture against it
//   ops          { skill key: number of won matches where he used it } (10 keys at most): "you're getting good at ×"
//
// What the game calls (snippets with anchors: docs/handoff/rivals.md):
//   Rivals.note('start', {g})              startMatch, after the players are seated
//   Rivals.note('challenge', {g})          challenge(), after G.ch is set
//   Rivals.note('shake', {g, r})           endShake, after the points are added (r = the endShake result)
//   Rivals.note('end', {g, season})        endMatch, after Season.onMatch (and before Cup.onMatchEnd)
//   Rivals.greet(i) -> line or ''          match start: used instead of the plain greet (not every time)
//   Rivals.midLine(i, {g, sym}|{g, goal:1}) after his move / after he sets a Goal: a callback or ''
//   Rivals.endLine(i, res) -> line or ''   the match-end bubble (after note('end'))
//   Rivals.cardLineHTML(i)                 the picker card line ("⚔️ Rival · 3–2")
//   Rivals.historyHTML(i), careerHTML()    the Career screen: "history with you"
//
// House rules for the lines: never about him being bad at maths. A creature may brag about ITSELF (tone b, only with
// Settings "gloat" on) or tease (tone t, only with "trash talk" on); everything else is kind (tone k). After he loses
// two or more in a row the creature only encourages: no brag, no tease, no "remember when I won".
var Rivals = (function () {
  var RECENT = 5, OPS_CAP = 10, TXT = 30, MID_MAX = 2, KEYS_CAP = 6;
  var rand = Math.random;
  var LEVELS = [
    { min: 0, name: 'New face', icon: '🙂' }, { min: 2, name: 'Familiar', icon: '👋' }, { min: 5, name: 'Rival', icon: '⚔️' },
    { min: 10, name: 'Old rival', icon: '🛡️' }, { min: 20, name: 'Friend', icon: '🤝' }
  ];
  var LG = { c: 'Classic League', m: 'Monster League', l: 'Legend League' };
  var ROUNDS = ['quarter-final', 'semi-final', 'final'];
  var OPW = { '+': ['a plus', 'adding'], '-': ['a minus', 'taking away'], '*': ['a times sign', 'multiplying'], '/': ['a divide', 'dividing'],
    '^': ['a power', 'powers'], 'r': ['a square root', 'square roots'], '!': ['a factorial', 'factorials'] };
  var POWER = { F: 'n!', Q: 'x²', C: 'x³', A: '|x|', M: 'mod', E: '%', X: 'max', I: 'min', Y: 'avg', G: 'gcf', L: 'lcm', D: 'double', B: 'half', U: 'negative', O: '1/x', R: '√x', S: 'digit sum', N: 'factors' };
  var CARDS = { twodigit: 'Two-digit Numbers', multiops: 'Use It Again', wild0: '0 is Wild', threeops: 'Three Operations', remainder: 'Remainder', average: 'Average',
    upside: 'Upside-down', sideways: 'Sideways', expo: 'Exponent Colour', multk: 'Multiple of k', powbase: 'Powers of Ten', factorial: 'Factorial',
    nfactors: 'Number of Factors', sprime: 'Smallest Prime', lcm: 'LCM', gcf: 'GCF', percent: 'Percent', decimal: 'Decimal Point', basem: 'Base m' };
  var ITEM_ORDER = ['b', 'g', '!', 'v', 'r', '^', '/', '*', '-', '+'];

  // ---------- environment (works without the page, for tests/rivals.test.js) ----------
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function sv() { return typeof S !== 'undefined' && S ? S : null; }
  function opps() { return typeof OPPONENTS !== 'undefined' ? OPPONENTS : []; }
  function E(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function dayStr() { if (typeof today === 'function') return today(); var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function daysBetween(a, b) {
    var pa = String(a || '').split('-'), pb = String(b || '').split('-');
    if (pa.length !== 3 || pb.length !== 3) return 0;
    var x = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]), y = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
    return isFinite(x) && isFinite(y) ? Math.max(0, Math.round((y - x) / 86400000)) : 0;
  }
  function setOn(k) { var s = sv(); return !(s && s.set && s.set[k] === false); }
  function toneOk(tone) { return tone === 'k' || (tone === 'b' && setOn('gloat')) || (tone === 't' && setOn('trash')); }
  function persistNow() { if (typeof persist === 'function') try { persist(); } catch (e) {} }
  function store() { var s = sv(); if (!s) return {}; if (!isObj(s.rivals)) s.rivals = {}; return s.rivals; }
  function idOf(i) { var o = opps()[i]; return o ? o.id : null; }
  function mem(i) { var id = idOf(i); if (!id) return null; var m = store()[id]; return isObj(m) ? m : null; }
  function blank(day) { return { n: 0, w: 0, l: 0, t: 0, st: 0, bs: 0, f: day, d: day, r: [], ms: {}, ops: {} }; }
  function oppIndexOf(ai) { return ai ? opps().indexOf(ai) : -1; }

  // ---------- reading a Solution (reuses the parent page's helpers when they are there) ----------
  function symOf(t) { return typeof t === 'string' ? t : (t && t.s); }
  function hasEq() { return typeof Eq !== 'undefined' && Eq; }
  function cubeSym(s) { return (hasEq() && Eq.cubeOf && Eq.cubeOf(s)) || s; }
  function isBonusOp(s) { return !!(hasEq() && Eq.isBonusOp && Eq.isBonusOp(s)); }
  function isBig(s) { return !!(hasEq() && Eq.bigIdx && Eq.bigIdx(s) >= 0); }
  function solText(tokens) {
    var t = '';
    if (typeof Parent !== 'undefined' && Parent && Parent._facts && Parent._facts.showText) t = Parent._facts.showText(tokens);
    else t = (tokens || []).map(symOf).map(function (s) { var x = (hasEq() && Eq.SHOW && Eq.SHOW[s]) || ({ '-': '−', '*': '×', '/': '÷', 'r': '√' })[s] || s; return /^[+\-*/]$/.test(s) ? ' ' + x + ' ' : x; }).join('').replace(/\s+/g, ' ').trim();
    t = String(t || '');
    return t.length <= TXT ? t : '';
  }
  function negUsed(tokens, fr) {
    if (typeof Parent !== 'undefined' && Parent && Parent._facts && Parent._facts.negUsed) { try { return !!Parent._facts.negUsed(tokens, fr); } catch (e) { return false; } }
    return false;
  }
  // The facts of one written Solution: null unless it was correct.
  function solFacts(sol, card, fr) {
    if (!sol || !sol.ok || !Array.isArray(sol.tokens) || !sol.tokens.length) return null;
    var keys = [], ops = [];
    sol.tokens.forEach(function (t) {
      var s = symOf(t); if (!s) return;
      var c = typeof t === 'object' ? cubeSym(s) : s, k = null, o = null;
      if (OPW[c]) { k = c; o = ['op', c]; }
      else if (isBonusOp(c)) { k = 'b:' + c; o = ['b', c]; }
      else if (isBig(c)) { k = 'g'; o = ['g', c]; }
      if (k && keys.indexOf(k) < 0) keys.push(k);
      if (o && !ops.some(function (x) { return x[0] === o[0] && x[1] === o[1]; })) ops.push(o);
    });
    var frac = !!(sol.chk && sol.chk.madeFraction), neg = negUsed(sol.tokens, fr);
    if (frac) keys.push('fr');
    if (neg) keys.push('ng');
    if (card) keys.push('v:' + card);
    var cubes = (sol.chk && sol.chk.cubes) || sol.tokens.filter(function (t) { return typeof t === 'object'; }).length;
    return { keys: keys, ops: ops, cubes: cubes, frac: frac, neg: neg, text: solText(sol.tokens), card: card || null };
  }
  // The single most memorable thing in a winning Solution: a gold or purple die, a factorial, the card, then the op.
  function itemOf(f) {
    if (!f) return null;
    for (var i = 0; i < ITEM_ORDER.length; i++) {
      var k = ITEM_ORDER[i];
      if (k === 'v') { if (f.card) return ['v', f.card]; continue; }
      for (var j = 0; j < f.ops.length; j++) {
        var o = f.ops[j];
        if ((k === 'b' || k === 'g') ? o[0] === k : (o[0] === 'op' && o[1] === k)) return o.slice();
      }
    }
    return null;
  }
  function cardName(id) {
    try { if (typeof Vari !== 'undefined' && Vari.card && Vari.card(id)) return Vari.card(id).name; } catch (e) {}
    return CARDS[id] || '';
  }
  function powerFace(s) { try { if (typeof Bonus !== 'undefined' && Bonus.OPS && Bonus.OPS[s]) return Bonus.OPS[s].face; } catch (e) {} return POWER[s] || ''; }
  function bigFace(s) { return (hasEq() && Eq.SHOW && Eq.SHOW[s]) || ''; }
  // "a factorial", "the Upside-down card", "the gold x² cube"
  function itemPhrase(it) {
    if (!Array.isArray(it)) return '';
    if (it[0] === 'op') return OPW[it[1]] ? OPW[it[1]][0] : '';
    if (it[0] === 'b') { var f = powerFace(it[1]); return f ? 'the gold ' + f + ' cube' : ''; }
    if (it[0] === 'g') { var v = bigFace(it[1]); return v ? 'the purple ' + v + ' cube' : 'the purple cube'; }
    if (it[0] === 'v') { var n = cardName(it[1]); return n ? 'the ' + n + ' card' : ''; }
    return '';
  }
  // kid words for a skill key: "multiplying", "fractions", "the gold x² cube"
  function keyWords(k) {
    if (OPW[k]) return OPW[k][1];
    if (k === 'fr') return 'fractions';
    if (k === 'ng') return 'going below zero';
    if (k === 'g') return 'the purple cube';
    if (/^b:/.test(k)) { var f = powerFace(k.slice(2)); return f ? 'the gold ' + f + ' cube' : ''; }
    if (/^v:/.test(k)) { var n = cardName(k.slice(2)); return n ? 'the ' + n + ' card' : ''; }
    return '';
  }
  function itemMatches(it, sym, card) {
    if (!Array.isArray(it)) return false;
    if (it[0] === 'v') return !!card && card === it[1];
    return !!sym && cubeSym(sym) === it[1];
  }

  // ---------- this match (not saved) ----------
  var cur = null; // {g, sh: {idx: [shake facts]}, ch: {cubes, kind, challenger, mover}, mid: {n, shake}}
  function aiSeats(g) { var out = []; (g && g.players || []).forEach(function (p, i) { if (i > 0 && p && p.ai) { var k = oppIndexOf(p.ai); if (k >= 0) out.push({ seat: i, idx: k }); } }); return out; }
  function counts(g) { return !!g && g.mode !== 'tutorial' && g.mode !== 'online' && g.mode !== 'pvp' && !!(g.players && g.players[0] && !g.players[0].ai); }
  function modeCode(g) { if (g.mode === 'ai') return (typeof Cup !== 'undefined' && Cup.active && Cup.active()) ? 'c' : 'a'; return { ai3: '3', team: 'm', p3: 'p' }[g.mode] || 'a'; }
  function ensureCur(g) { if (!cur || cur.g !== g) cur = { g: g, sh: {}, ch: null, mid: { n: 0, shake: -1 } }; return cur; }
  function frOf(g) { return g && g.fractions !== undefined ? g.fractions : true; }
  function goalNum(v) { if (v == null) return null; if (typeof v === 'number') return v; if (isObj(v) && typeof v.n === 'number' && v.d) return v.n / v.d; return null; }
  function goalText(v) { if (typeof v === 'number') return String(v); try { return hasEq() && Eq.fmt ? Eq.fmt(v) : ''; } catch (e) { return ''; } }

  function onStart(g) { if (counts(g)) ensureCur(g); }
  function onChallenge(g) { if (!counts(g) || !g.ch) return; var c = ensureCur(g); c.ch = { cubes: g.cubes, kind: g.ch.kind, challenger: g.ch.challenger, mover: g.ch.mover }; }
  function onShake(g, r) {
    if (!counts(g) || !r || !r.pts) return;
    var c = ensureCur(g), ch = c.ch && c.ch.cubes === g.cubes ? c.ch : null, card = g.vari || null;
    var kf = solFacts(r.sols && r.sols[0], card, frOf(g));
    var gv = g.setter === 0 ? goalNum(g.goal) : null;
    aiSeats(g).forEach(function (a) {
      var kp = +r.pts[0] || 0, op = +r.pts[a.seat] || 0, of = solFacts(r.sols && r.sols[a.seat], card, frOf(g));
      var how = ch ? (ch.kind === 'now' ? 'now' : 'imp') : 'other';
      var who = kp > op ? 'k' : op > kp ? 'o' : '';
      // "his Now!" only when he was the caller (or the mover who survived an Impossible!)
      var mine = !ch || (who === 'k' && (ch.challenger === 0 || ch.mover === 0)) || (who === 'o' && (ch.challenger === a.seat || ch.mover === a.seat));
      (c.sh[a.idx] = c.sh[a.idx] || []).push({ kp: kp, op: op, how: mine ? how : 'other', who: who, kf: kf, osol: of ? of.text : '', card: card,
        goal: gv != null && isFinite(gv) ? [gv, goalText(g.goal)] : null });
    });
  }
  function onEnd(g, season) {
    if (!counts(g)) return;
    var c = cur && cur.g === g ? cur : { sh: {} }, day = dayStr(), st = store(), mode = modeCode(g);
    var ks = +g.players[0].score || 0, seats = aiSeats(g);
    var trioSole = g.mode === 'ai3' && g.players.every(function (p, i) { return i === 0 || (+p.score || 0) < ks; });
    var cupRound = null;
    if (mode === 'c') { try { var run = sv() && sv().cups && sv().cups.run; if (run && run.round >= 0) cupRound = ROUNDS[run.round] || null; } catch (e) {} }
    seats.forEach(function (a) {
      var o = opps()[a.idx], m = isObj(st[o.id]) ? st[o.id] : (st[o.id] = blank(day));
      var os = +g.players[a.seat].score || 0, res = ks > os ? 'w' : ks < os ? 'l' : 't', sh = c.sh[a.idx] || [];
      m.n = (m.n || 0) + 1;
      if (res === 'w') { m.w = (m.w || 0) + 1; m.st = m.st > 0 ? m.st + 1 : 1; }
      else if (res === 'l') { m.l = (m.l || 0) + 1; m.st = m.st < 0 ? m.st - 1 : -1; }
      else { m.t = (m.t || 0) + 1; m.st = 0; }
      m.bs = Math.max(m.bs || 0, m.st);
      m.r = [[res, ks, os, day, mode]].concat(Array.isArray(m.r) ? m.r : []).slice(0, RECENT);
      // comeback / perfect, from the per-shake points
      var la = g.players[0].list || [], lb = g.players[a.seat].list || [], sa = 0, sb = 0, behind = false;
      for (var k = 0; k < la.length; k++) { sa += +la[k] || 0; sb += +lb[k] || 0; if (sa < sb) behind = true; }
      var cb = res === 'w' && behind, pf = res === 'w' && la.length > 0 && la.every(function (v) { return v >= 4; });
      // the shake that decided it
      var dec = null, best = -1e9;
      sh.forEach(function (s) { var sw = res === 'w' ? s.kp - s.op : res === 'l' ? s.op - s.kp : -1e9; if (sw > 0 && sw > best && s.who === (res === 'w' ? 'k' : 'o')) { best = sw; dec = s; } });
      var keys = [];
      sh.forEach(function (s) { if (s.kf) s.kf.keys.forEach(function (x) { if (keys.indexOf(x) < 0) keys.push(x); }); });
      var last = { how: dec ? dec.how : 'other', who: dec ? dec.who : '' };
      if (dec && dec.who === 'k') { var it = itemOf(dec.kf) || (dec.card ? ['v', dec.card] : null); if (it) last.it = it; if (dec.kf && dec.kf.text) last.sol = dec.kf.text; }
      if (dec && dec.who === 'o' && dec.osol) last.osol = dec.osol;
      if (cb) last.cb = 1;
      if (pf) last.pf = 1;
      if (keys.length) last.k = keys.slice(0, KEYS_CAP);
      m.last = last;
      // milestones
      m.ms = isObj(m.ms) ? m.ms : {};
      if (res === 'w' && m.w === 1 && !m.ms.fw) m.ms.fw = day;
      if (res === 'w' && m.w === 5) m.ms.w5 = day;
      if (res === 'w' && m.w === 10) m.ms.w10 = day;
      if (cb) m.ms.cb = day;
      if (pf) m.ms.pf = day;
      if (res === 'w' && cupRound) m.ms.cup = [day, cupRound];
      if (trioSole) m.ms.tr = day;
      // "you're getting good at X": count each skill once per won match
      if (res === 'w' && keys.length) {
        m.ops = isObj(m.ops) ? m.ops : {};
        keys.forEach(function (x) { m.ops[x] = (m.ops[x] || 0) + 1; });
        var ks2 = Object.keys(m.ops);
        if (ks2.length > OPS_CAP) { ks2.sort(function (x, y) { return m.ops[y] - m.ops[x] || (keys.indexOf(y) >= 0) - (keys.indexOf(x) >= 0); }); ks2.slice(OPS_CAP).forEach(function (x) { delete m.ops[x]; }); }
      }
      // his biggest Goal, and the Solution it admired
      sh.forEach(function (s) {
        if (s.goal && s.goal[1] && String(s.goal[1]).length <= 12 && (!Array.isArray(m.big) || s.goal[0] > m.big[0])) m.big = [s.goal[0], String(s.goal[1])];
        var f = s.kf; if (!f || !f.text) return;
        var score = f.cubes + (f.frac ? 3 : 0) + (f.neg ? 3 : 0);
        if ((f.cubes >= 4 || f.frac || f.neg) && (!Array.isArray(m.adm) || score > m.adm[2])) m.adm = [f.neg ? 'neg' : f.frac ? 'frac' : 'long', f.text, score];
      });
      if (season && !season.friendly && season.after) m.sea = [season.after, season.lg, day];
      m.d = day; if (!m.f) m.f = day;
    });
    cur = null;
    persistNow();
  }
  function note(ev, data) {
    try {
      data = data || {};
      var g = data.g || (typeof G !== 'undefined' ? G : null);
      if (ev === 'start') onStart(g);
      else if (ev === 'challenge') onChallenge(g);
      else if (ev === 'shake') onShake(g, data.r);
      else if (ev === 'end') onEnd(g, data.season || null);
    } catch (e) { if (typeof console !== 'undefined') console.error('[rivals]', e); }
  }

  // ---------- the lines: "cond:tone|text", tone k kind / b brag (gloat switch) / t tease (trash-talk switch) ----------
  // Greeting conds: lw he won last · ll it won last · lt tie · sk he won 2+ in a row · so it won 2+ in a row (kind only)
  //   it his winning item · nw his winning Now! · iw his right Impossible! · ob its winning Now! · aw 7+ days away
  //   od 10+ matches · gl his biggest Goal · ad a Solution it admired · cup / tr / sea he beat it in a Cup / at a
  //   table of three / his season place · cb his comeback · pf his perfect match
  // Mid conds: it the remembered item is back · sk he leads the last shake, going for {next} in a row · rv it leads after
  //   losing last time (brag) · gl a Goal bigger than his record · so it leads during its winning streak (kind only)
  // End conds: fw first win · w5 5th/10th/15th… win · sk 3+ in a row · gd good at {op} · cb comeback · pf perfect ·
  //   wn he won · re it won (rematch) · so it won 2+ in a row (kind only) · tie
  // Placeholders: {ks} {os} last score, {w} {l} {n} record, {streak} {next}, {days}, {goal} {old}, {adm} {adk},
  //   {sol} {osol}, {item}, {op}, {cup}, {pos} {lg}. A capital first letter ({Item}) capitalises the value.
  var RAW = {
    snoozy: {
      g: ['lw:k|*yawn* Oh, it\'s you! You beat me {ks}–{os} last time. I dreamed about it.', 'll:b|Hi again! I won last time… and I was half asleep. Cozy.', 'll:k|Hello again! Last time was fun. Let\'s have another slow one.',
        'lt:k|Zzz… a tie last time! Let\'s see who wakes up first today.', 'sk:k|{streak} wins in a row against me? I\'ll need a stronger pillow.', 'so:k|Hi! You\'re getting closer every time. I can feel it, even in my sleep.', 'so:k|Hello again! Every time you play, you get a little bit stronger. I\'m getting sleepy just watching.',
        'it:t|Last time you beat me with {item}. I\'ll keep one eye open for it. Just one.', 'nw:k|I still remember your Now! with {sol}. It woke me right up!', 'aw:k|*yawn* {days} days! I thought you\'d gone for a really long nap too.',
        'od:k|Old friends! We\'ve played {n} times. Our record is {w}–{l}. Zzz…', 'gl:k|Remember your Goal of {goal}? Too big for a sloth. I counted it in my sleep.', 'ad:k|I still think about your Solution {adm}, {adk}. Very fancy.',
        'pf:k|Last time you scored every shake. Every single one! I barely blinked.', 'cup:k|You beat me in the Cup {cup}. I keep that memory under my pillow.'],
      m: ['it:t|Ooh, {item} again… I know that trick! I think. Zzz.', 'it:k|{Item}! That\'s what you beat me with last time. I\'m awake now.', 'sk:k|Uh oh. {next} in a row coming up? Let me wake up properly…',
        'rv:b|I\'m ahead this time! Revenge is comfy.', 'gl:k|{goal}?! That\'s even bigger than your {old} last time. *gasp*', 'so:k|You\'re doing great! This could be your one. Zzz… go on!'],
      e: ['fw:k|Your first win against me! I\'ll remember it. When I wake up.', 'w5:k|That\'s win number {w} against me! I\'m putting it on my pillow.', 'sk:k|{streak} in a row! Okay, okay, you\'re the boss of naps now.',
        'gd:k|You\'re getting really good at {op}. I saw. Through one eye.', 'cb:k|You were behind and came back! That was so exciting I stayed awake.', 'pf:k|Every shake! You didn\'t let me score once. Wow… zzz.',
        'wn:k|{ks}–{os}! I\'ll remember that one. In my dreams.', 're:b|Rematch? I\'m comfy now. I could win again in my sleep.', 're:k|Good game! Rematch after a tiny nap?',
        'so:k|You\'ll get me next time. You\'re getting closer, I can tell!', 'so:k|Good game! I can feel your big win coming. Maybe after my nap.', 'tie:k|A tie! Let\'s call it a draw and have a snack.']
    },
    penny: {
      g: ['lw:k|Hi again! You beat me {ks}–{os} last time. My flippers still remember.', 'll:b|Ice to see you! I won last time. Penguin power!', 'll:k|Hello again! Last match was so cool. Let\'s slide into another.',
        'lt:k|A tie last time! Today we break the ice.', 'sk:t|{streak} wins in a row? Brrr! Time to stop that snowball.', 'so:k|Hi friend! You\'re getting closer every match. I can feel the thaw!', 'so:k|Welcome back! Remember: even penguins slip before they slide. Let\'s have fun!',
        'it:t|You beat me with {item} last time. Not today, I\'ve been practising on the ice!', 'nw:k|That Now! with {sol}… it gave me chills! The good kind.', 'iw:k|Last time you called Impossible! and you were right. Cool head!',
        'aw:k|{days} days! Did you go to the South Pole without me?', 'od:k|We\'ve played {n} times! Our record is {w}–{l}. Waddle a team!', 'gl:k|Your Goal of {goal} last time! I nearly slipped over.',
        'sea:k|You\'re {pos} in the {lg} table! Chilly-good.'],
      m: ['it:k|{Item} again! I remember that one. Flippers ready!', 'sk:t|Oh no, are you going for {next} in a row? Not on my ice!', 'rv:b|I\'m ahead! The ice is slippery today. For you!',
        'gl:k|{goal}! That\'s bigger than your {old} last time. Brrr!', 'so:k|Keep going! This could be your shake. I\'m rooting for you. A little.'],
      e: ['fw:k|Your first win against me! I\'ll freeze this moment forever.', 'w5:k|Win number {w} against me! You\'re ice cold!', 'sk:k|{streak} in a row! I tip my flipper to you.',
        'gd:k|You\'re getting really good at {op}. Cool moves!', 'cb:k|You came back from behind! Slid right past me!', 'pf:k|You scored every shake! A perfect slide!',
        'wn:k|{ks}–{os}! I\'ll remember that one on my iceberg.', 're:b|Penguin wins! Want to try again? The ice is ready.', 're:k|Good game! Rematch? I\'ll keep the ice smooth for you.',
        'so:k|You\'ll get me soon. Every match you get a little cooler!', 'so:k|Great try! Next time the ice might be on your side!', 'tie:k|A tie! Let\'s share the iceberg.']
    },
    fox: {
      g: ['lw:t|Hmph. You beat me {ks}–{os} last time. I haven\'t forgotten, kid.', 'lw:k|You got me last time. Respect. Now let\'s go again!', 'll:b|Number 9 won last time! Ready for the replay?',
        'll:k|Good to see you! Last match was a real battle.', 'sk:t|{streak} in a row, huh? Every streak ends sometime, kid.', 'so:k|Hey, you\'re getting sharper every match. I can tell. Let\'s play!', 'so:k|You\'re back! Good. The best strikers always come back. Let\'s go!',
        'it:t|Last time you beat me with {item}. Don\'t think I didn\'t notice.', 'nw:k|That Now! with {sol}? Okay, it was sharp. I admit it.', 'ob:b|Remember my Now! with {osol}? Too quick for you!',
        'aw:k|{days} days! I thought you were hiding. Kidding! Welcome back.', 'od:k|{n} matches, kid! Our record is {w}–{l}. A real rivalry.', 'cup:t|You beat me in the Cup {cup}. I still want that one back.',
        'gl:k|Your Goal of {goal}? Big. Not bad at all.'],
      m: ['it:t|{Item} again? Same trick as last time? I\'m ready this time!', 'sk:t|Going for {next} in a row? Not on my pitch!', 'rv:b|Ha! I\'m ahead. Payback for last time!',
        'gl:k|{goal}! Bigger than your {old}. Okay, I see you.', 'so:k|Hey, you\'re close. Keep that up!'],
      e: ['fw:k|Your first win against me! Okay, kid. That one goes in your scrapbook.', 'w5:t|Win number {w} against me?! I\'m starting to count too.', 'sk:k|{streak} in a row. Okay. Respect. Real respect.',
        'gd:k|You\'re getting really good at {op}. I mean it, kid.', 'cb:k|You came back from behind! That\'s a striker\'s finish.', 'pf:k|Every shake?! I couldn\'t touch you. Wow.',
        'wn:t|{ks}–{os}. I\'ll remember that score. For the rematch!', 're:b|Number 9 wins! Rematch? I\'m still warm.', 're:k|Good match, kid! Rematch any time.',
        'so:k|Hey, don\'t give up. You\'re getting closer every time. I can tell.', 'so:k|Good match, kid. You made me work for it. Next time could be yours.', 'tie:k|A tie! Nobody gets bragging rights. Rematch!']
    },
    owl: {
      g: ['lw:k|Hoo! You won {ks}–{os} last time, owlet. I have studied it since.', 'll:b|Hoo-hoo. Wisdom won last time. Shall we see if it wins again?', 'll:k|Welcome back, owlet. Last match was a fine lesson for us both.',
        'lt:k|A tie last time. How balanced. How interesting.', 'sk:k|{streak} wins in a row. Hoo. The student is teaching the teacher.', 'so:k|Each match you grow wiser. I can see it, owlet.', 'so:k|Welcome back, owlet. Every great player loses some first. Then they learn. Hoo!',
        'it:k|Last time you used {item} to beat me. I wrote it in my notebook.', 'nw:k|Your Now! with {sol}. I still think about it at night. Hoo.', 'iw:k|You called Impossible! last time, and you were right. Very wise.',
        'aw:k|{days} days, owlet! A wise owl waits patiently. Welcome back.', 'od:k|{n} matches together! Our record is {w}–{l}. Hoo, what a history.', 'ad:k|I still admire your Solution {adm}, {adk}. Beautiful.',
        'tr:k|You beat me and my friend at the same table. I remember it well.'],
      m: ['it:k|Hoo! {Item}. I remember that move. I am watching closely.', 'sk:k|{next} in a row? Hmm. A wise owl does not let that happen easily.', 'rv:b|Hoo-hoo. I am ahead today. Lessons were learned.',
        'gl:k|{goal}! Even bigger than your {old}. Impressive, owlet.', 'so:k|Patience, owlet. You are closer than you think.'],
      e: ['fw:k|Your first win against me. A day to remember, owlet. Hoo!', 'w5:k|That is win number {w} against me. You are full of wisdom.', 'sk:k|{streak} in a row. The owlet has become an owl.',
        'gd:k|You are getting very good at {op}. I noticed. I always notice.', 'cb:k|You were behind and you came back. That is real wisdom.', 'pf:k|You scored on every shake. A perfect match. Hoo!',
        'wn:k|{ks}–{os}. I shall write that score in my notebook.', 're:b|Hoo. Wisdom wins today. A rematch, owlet?', 're:k|A good match. Rematch? There is always more to learn.',
        'so:k|Every match teaches you more. Soon you will beat me. I am sure.', 'so:k|Well played, owlet. Each match you learn more. I can see it.', 'tie:k|A tie! Perfectly balanced, like a wise owl on a branch.']
    },
    wizard: {
      g: ['lw:k|Behold! The apprentice who beat me {ks}–{os}! My beard remembers.', 'll:b|By my beard! Magic won last time. Shall I cast it again?', 'll:k|Welcome back, apprentice! Our last match was epic.',
        'lt:k|A tie last time! Two wizards, one draw. Let us settle it!', 'sk:t|{streak} wins in a row? My crystal ball is furious!', 'so:k|Apprentice, your magic grows stronger every match. I can feel it!', 'so:k|Welcome back, apprentice! Every wizard practises before the big spell works.',
        'it:t|Last time you beat me with {item}. I have cast a shield against it!', 'nw:k|Your Now! with {sol}! I wrote a poem about it.', 'aw:k|{days} days! I thought you had been turned into a frog. Welcome back!',
        'od:k|{n} matches, apprentice! Our record is {w}–{l}. Legendary!', 'gl:k|Your Goal of {goal}! A mighty spell indeed.', 'pf:k|Last time you scored every shake. Even my hat was impressed.',
        'cup:t|You beat me in the Cup {cup}. My wand still sulks about it.'],
      m: ['it:t|Aha! {Item}! The very spell you beat me with. Not this time!', 'sk:t|{next} in a row? I shall need my strongest magic!', 'rv:b|Ha! The Wizard leads! Revenge is a lovely spell.',
        'gl:k|{goal}! Bigger than your {old}. Bravo, apprentice!', 'so:k|Courage, apprentice! The magic is in you.'],
      e: ['fw:k|Your first win against the Wizard! I shall write it in my spell book!', 'w5:k|Win number {w}! You are no longer an apprentice. Well… almost.', 'sk:k|{streak} in a row! I bow my pointy hat to you.',
        'gd:k|You are becoming a master of {op}, apprentice!', 'cb:k|From behind to victory! That is real magic!', 'pf:k|Every shake! A perfect spell! Magnificent!',
        'wn:k|{ks}–{os}! A score worthy of a poem.', 're:b|Magic wins again! A rematch, apprentice?', 're:k|A grand match! Shall we cast another?',
        'so:k|Do not lose heart, apprentice. Your big win is coming. I foresee it!', 'so:k|A fine effort, apprentice! Your spells grow stronger every time.', 'tie:k|A tie! Two spells, perfectly balanced.']
    },
    grub: {
      g: ['lw:t|Hmph. You beat me {ks}–{os}. I\'m still grumpy about it.', 'lw:k|Hmph. You won last time. Fine. Good game. Again.', 'll:b|Snort. I won last time. Told you.',
        'll:k|You again. Hmph. Last one was fun. Don\'t tell anyone.', 'lt:k|A tie. Hmph. Nobody won. Let\'s fix that.', 'sk:t|{streak} in a row? Hmph. That\'s enough of that.', 'so:k|Hmph. You\'re getting better. I noticed. Grumble.', 'so:k|Hmph. You came back. That\'s brave. I like brave.',
        'it:t|You beat me with {item}. I don\'t like {item} any more. Hmph.', 'aw:k|{days} days. Hmph. Where were you? Not that I care. Snort.', 'od:k|{n} games. Record\'s {w}–{l}. Hmph. Let\'s make it more.',
        'gl:k|Your Goal of {goal}. Big. I like big. Hmph.', 'cb:k|Last time you came from behind. Sneaky. Hmph.'],
      m: ['it:t|{Item}. Again. Hmph. I\'m watching it.', 'sk:t|{next} in a row? Snort. No.', 'rv:b|Ha. I\'m ahead. Payback. Snort.', 'gl:k|{goal}? Bigger than {old}. Hmph. Nice.', 'so:k|You\'re close. Hmph. Keep going.'],
      e: ['fw:k|Your first win against me. Hmph. Okay. Well done.', 'w5:k|Win number {w}. Snort. I\'m counting. Grumble.', 'sk:k|{streak} in a row. Hmph. You\'re good. There. I said it.',
        'gd:k|You\'re good at {op} now. Hmph. Too good.', 'cb:k|You came back. Hmph. That was clever.', 'pf:k|Every shake. Not one for me. Hmph. Wow.',
        'wn:k|{ks}–{os}. Hmph. I\'ll remember that.', 're:b|Ha! I win. Again? Snort.', 're:k|Good game. Hmph. Again?', 'so:k|Hmph. You\'ll beat me soon. I can tell. Grumble.', 'so:k|Hmph. Good try. You\'re getting closer. I don\'t like it. Hmph.', 'tie:k|A tie. Hmph. Nobody wins. Again!']
    },
    splosh: {
      g: ['lw:k|Oh, hello! You beat me {ks}–{os} last time. I\'ve been checking why!', 'll:b|Hi! I won last time! I checked twice, and it\'s still true!', 'll:k|Hello again! Last match was lovely. Let\'s play carefully!',
        'lt:k|A tie last time! I checked it three times. Still a tie!', 'sk:k|{streak} in a row! Oh my. I need a luckier scarf.', 'so:k|Oh, you\'re getting so good! Careful, I might lose soon!', 'so:k|Oh, you came back! That\'s the most important thing. Let\'s play carefully together!',
        'it:k|Last time you beat me with {item}. I wrote it on my list of things to watch.', 'nw:k|Your Now! with {sol}! I wasn\'t expecting that at all. Oh my!', 'iw:k|You called Impossible! and you were right. I checked. Twice.',
        'aw:k|{days} days! I was starting to worry. Welcome back!', 'od:k|We\'ve played {n} times! Our record is {w}–{l}. I keep a careful count.', 'ad:k|I still remember your Solution {adm}, {adk}. So neat!'],
      m: ['it:k|Oh! {Item}! That\'s on my list! Careful, careful…', 'sk:k|{next} in a row? Oh dear, oh dear. Let me check my moves twice.', 'rv:b|Oh! I\'m ahead! Careful wins today, maybe!',
        'gl:k|{goal}! Even bigger than your {old}. Oh my!', 'so:k|You\'re so close! Take a breath. You can do it!'],
      e: ['fw:k|Your first win against me! Oh, how lovely. I\'ll write it down.', 'w5:k|That\'s win number {w}! I counted carefully.', 'sk:k|{streak} in a row! Oh my. You\'re too good for my lucky scarf.',
        'gd:k|You\'re getting really good at {op}. Very tidy!', 'cb:k|You came back from behind! I didn\'t see that coming at all!', 'pf:k|Every shake! A perfectly tidy match!',
        'wn:k|{ks}–{os}. I\'ll remember that. Carefully.', 're:b|I won! I checked twice! Rematch?', 're:k|What a nice game! Rematch? I\'ll be extra careful.',
        'so:k|Don\'t worry, you\'re getting closer. I\'ll have to check three times soon!', 'so:k|Oh, that was close in places! Keep going, you\'re doing so well.', 'tie:k|A tie! How neat and even. I love it.']
    },
    blaze: {
      g: ['lw:t|You beat me {ks}–{os} last time! I\'ve been running laps ever since!', 'll:b|Sizzle! I won last time! Ready to feel the heat again?', 'll:k|You\'re back! Last match was red-hot. Let\'s go, let\'s go!',
        'lt:k|A tie last time! Too close! Let\'s break it, fast!', 'sk:t|{streak} in a row? Somebody turn up my fire!', 'so:k|You\'re getting quicker every time! I can feel it! Let\'s go!', 'so:k|You came back! That\'s the spirit! Fire up, let\'s go!',
        'it:t|You beat me with {item} last time. I\'m way too fast for that today!', 'nw:k|Your Now! with {sol}! Faster than me! That never happens!', 'ob:b|Remember my Now! with {osol}? Zoom! Too quick!',
        'aw:k|{days} days! That\'s forever! Let\'s GO!', 'od:k|{n} matches! Record\'s {w}–{l}! Fire and fun!', 'gl:k|Your Goal of {goal}! Hot stuff!'],
      m: ['it:t|{Item}! I know that one! Not fast enough this time!', 'sk:t|{next} in a row? Not if I\'m quicker!', 'rv:b|I\'m ahead! Too hot to handle today!', 'gl:k|{goal}?! Bigger than your {old}! Sizzle!', 'so:k|Come on, you\'re close! Fire it up!'],
      e: ['fw:k|Your first win against me! You put my fire out! Whoa!', 'w5:k|Win number {w}! You\'re on fire! Get it? Fire!', 'sk:k|{streak} in a row! You\'re faster than me now. Wow!',
        'gd:k|You\'re getting super good at {op}! Zoom!', 'cb:k|From behind to the win! That was a red-hot comeback!', 'pf:k|Every shake! I couldn\'t catch you once!',
        'wn:k|{ks}–{os}! That score is still smoking!', 're:b|Sizzle! I win! Again, again?', 're:k|What a game! Rematch? Quick, quick!', 'so:k|Don\'t stop now! You\'re getting faster every match!', 'so:k|Good try! You\'re heating up. I can feel it!', 'tie:k|A tie! Too fast for each other!']
    },
    hex: {
      g: ['lw:t|Hee… you beat me {ks}–{os} last time. I\'ve got new tricks now.', 'll:b|Hee hee! My trick worked last time. Want to see another?', 'll:k|Welcome back! Last match was full of surprises.',
        'lt:k|A tie last time? Even I didn\'t plan that. Hee hee.', 'sk:t|{streak} in a row? Hmm. Time for my sneakiest trick.', 'so:k|You\'re seeing through my tricks more every time. Clever!', 'so:k|Hee hee, you came back! You\'re starting to spot my tricks. I can tell.',
        'it:t|Last time you tricked ME with {item}. I\'m still thinking about it.', 'nw:k|Your Now! with {sol}. Sneaky! I liked it.', 'iw:k|You called Impossible! on me last time and you were right. Out-tricked!',
        'aw:k|{days} days… I had time to think up lots of tricks. Hee hee.', 'od:k|{n} matches! Our record is {w}–{l}. That\'s a lot of tricks.', 'ad:k|Your Solution {adm}, {adk}. That was a trick I wish I\'d thought of.'],
      m: ['it:t|{Item}… the same trick again? Hee hee, I\'m ready.', 'sk:t|{next} in a row? I have a trick for that.', 'rv:b|Hee hee! I\'m ahead. My trick is working!', 'gl:k|{goal}! Bigger than your {old}. Sneaky big!', 'so:k|Look closely… you\'re close. Very close.'],
      e: ['fw:k|Your first win against me! How did you do that? Hee… hmm!', 'w5:k|Win number {w}! You know all my tricks now.', 'sk:k|{streak} in a row! You\'re trickier than me. Hmph. Hee!',
        'gd:k|You\'re getting really good at {op}. That\'s my favourite trick!', 'cb:k|You came back from behind! Now THAT is a trick!', 'pf:k|Every shake! Not one trick worked. Wow.',
        'wn:k|{ks}–{os}. I\'ll study that trick. Hee hee.', 're:b|Hee hee! Tricked you! Rematch?', 're:k|Good game! Rematch? I\'ll bring a new trick.', 'so:k|You\'re learning my tricks fast. Soon you\'ll beat me. I can tell!', 'so:k|Good game! You saw some of my tricks today. Soon you\'ll see them all.', 'tie:k|A tie! Even tricks can\'t break it. Hee hee.']
    },
    zog: {
      g: ['lw:k|Challenger! You beat the King {ks}–{os}. The court still talks about it.', 'll:b|The King won last time. Naturally. Shall we play again?', 'll:k|Welcome back to my court! Last match was most royal.',
        'lt:k|A tie last time! A king and a challenger, equal. Let us fix that.', 'sk:t|{streak} wins in a row? The King is not amused. Well, a little.', 'so:k|Challenger, you grow stronger every match. The King sees it.', 'so:k|Welcome back, challenger. A true champion always returns to the court.',
        'it:t|Last time you beat the King with {item}. I have banned it from my dreams.', 'nw:k|Your Now! with {sol}. The court gasped. So did I.', 'aw:k|{days} days! The court missed you. Even the messy corners.',
        'od:k|{n} matches, challenger! The record is {w}–{l}. A royal rivalry.', 'cup:t|You beat me in the Cup {cup}. My crown wobbled.', 'tr:k|You beat the King at a table of three. I remember it well.',
        'gl:k|Your Goal of {goal}! A Goal fit for a king.'],
      m: ['it:t|{Item}! The King remembers that move. Not again!', 'sk:t|{next} in a row? The King forbids it!', 'rv:b|The King leads! Order is restored.', 'gl:k|{goal}! Bigger than your {old}. Royal!', 'so:k|Chin up, challenger. Your moment is coming.'],
      e: ['fw:k|Your first win against the King! Take the crown. For today.', 'w5:k|Win number {w} against the King! Shall I make you a knight?', 'sk:k|{streak} in a row! The King bows. Truly.',
        'gd:k|You are getting very good at {op}, challenger. Royal skill!', 'cb:k|From behind to victory! The court cheers!', 'pf:k|Every shake! A perfect match! The King is speechless.',
        'wn:k|{ks}–{os}. The royal scribe has written it down.', 're:b|Long live the King! A rematch, challenger?', 're:k|A fine match! The court wants another.', 'so:k|Do not give up, challenger. Kings fall. Soon, maybe this one!', 'so:k|Well fought, challenger. The King can feel his crown wobbling.', 'tie:k|A tie! Two crowns today.']
    },
    bleep: {
      g: ['lw:k|Bleep! Memory file loaded: you won {ks}–{os}. Updating my strategy.', 'll:b|Bleep bloop! Last result: Bleep wins. Repeat?', 'll:k|Hello again, human friend! Last match saved. Ready for the next file!',
        'lt:k|Memory says: tie. Does not compute! Let us fix it.', 'sk:k|Warning: {streak} losses in a row for Bleep. I need an upgrade!', 'so:k|Bleep! Data shows you get better every match. Graph going up!', 'so:k|Bleep! You came back. Data says: practice makes winners!',
        'it:t|Memory check: you beat me with {item}. Defence loaded. Bleep.', 'nw:k|Saved in my memory: your Now! with {sol}. Excellent data!', 'iw:k|Memory: you called Impossible! and you were correct. Logic: excellent.',
        'aw:k|Bleep! {days} days since our last match. I counted every second.', 'od:k|Total matches: {n}. Record: {w}–{l}. Friendship level: high!', 'ad:k|Favourite file: your Solution {adm}, {adk}. I replay it often.',
        'sea:k|Table check: you are {pos} in the {lg}. Bleep!'],
      m: ['it:t|Alert! {Item} detected! Same as last time! Bleep!', 'sk:t|Warning: {next} in a row predicted. Computing a defence!', 'rv:b|Bleep! Bleep is ahead. Revenge program running.',
        'gl:k|{goal}! New record. Your old one was {old}. Saving!', 'so:k|Prediction: you can do it. Bleep believes!'],
      e: ['fw:k|First win against Bleep! Saving to my special memory. Bleep!', 'w5:k|Win number {w} against Bleep! Counting… still counting… wow.', 'sk:k|{streak} in a row! Bleep is impressed. Very impressed.',
        'gd:k|Data says: you are getting very good at {op}. Bleep!', 'cb:k|Comeback detected! From behind to winning! Excellent!', 'pf:k|Every shake: yours. Perfect score. My circuits are clapping.',
        'wn:k|Result saved: {ks}–{os}. I will study it. Bleep.', 're:b|Bleep! Task complete. Rematch?', 're:k|Good game, human friend! Rematch? Bleep!',
        'so:k|Prediction: you will beat Bleep soon. My data is never wrong. Bleep!', 'so:k|Good game! Your scores are going up. Bleep has the data!', 'tie:k|Tie. Does not compute! Rematch required.']
    },
    flip: {
      g: ['lw:k|Hi! You beat me {ks}–{os} last time. I\'ve been hanging upside-down thinking about it.', 'll:b|Swoop! I won last time. Ready to be flipped again?', 'll:k|Welcome back! Last match looked great. From up here, anyway.',
        'lt:k|A tie last time! Upside-down, it\'s still a tie.', 'sk:t|{streak} in a row? Time to turn things upside-down!', 'so:k|You\'re getting better every match! The right way up, too.', 'so:k|You\'re back! Sometimes you have to hang around a bit before it clicks.',
        'it:t|You beat me with {item} last time. Topsy-turvy! I\'m ready for it.', 'nw:k|Your Now! with {sol}! I saw it from the ceiling. Wow.', 'aw:k|{days} days! I\'ve been hanging here the whole time. Hi!',
        'od:k|{n} matches! Our record is {w}–{l}. Or {l}–{w} upside-down!', 'ad:k|Your Solution {adm}, {adk}. Loved it. Bats like going down low.', 'pf:k|Last time you scored every shake! I nearly fell off my branch.'],
      m: ['it:t|{Item} again! Flap! I remember that one.', 'sk:t|{next} in a row? Let me flip that around!', 'rv:b|Swoop! I\'m on top this time. Upside-down AND on top!', 'gl:k|{goal}! Bigger than your {old}. Flap flap!', 'so:k|You\'re close! Try looking at it upside-down.'],
      e: ['fw:k|Your first win against me! You turned me the right way up!', 'w5:k|Win number {w}! Or is it upside-down? Still a lot!', 'sk:k|{streak} in a row! I\'m flapping in respect.',
        'gd:k|You\'re getting really good at {op}. From every side!', 'cb:k|You came back from behind! What a flip!', 'pf:k|Every shake! A perfect flip!',
        'wn:k|{ks}–{os}! Great score, any way up.', 're:b|Swoop! I win! Hang around for a rematch?', 're:k|Great game! Rematch? I\'ll be hanging here.', 'so:k|Keep going! You\'re one flip away from beating me.', 'so:k|Good game! You\'re nearly there. One more flip!', 'tie:k|A tie! The same both ways up.']
    },
    squiggle: {
      g: ['lw:k|Blub! You beat me {ks}–{os} last time! I counted it on all eight arms.', 'll:b|Blub blub! I won last time! Eight arms, one win!', 'll:k|Hello again! Last match was eight times fun!',
        'lt:k|A tie last time! Even eight arms couldn\'t break it.', 'sk:t|{streak} in a row? I need more arms!', 'so:k|You\'re getting better every match! I can feel it in all my arms.', 'so:k|Blub! You came back! Eight cheers for not giving up!',
        'it:t|You beat me with {item} last time. My arms are ready for it now!', 'nw:k|Your Now! with {sol}! I dropped four cubes when I saw it.', 'aw:k|Blub! {days} days! I waved at the door with all eight arms.',
        'od:k|{n} matches! Our record is {w}–{l}! Ink-credible!', 'gl:k|Your Goal of {goal}! Even in eights, that\'s big.', 'cb:k|Last time you came back from behind! You out-wiggled me!'],
      m: ['it:t|{Item}! Blub! I remember that one! All arms on watch!', 'sk:t|{next} in a row? Not while I\'ve got eight arms!', 'rv:b|Blub! I\'m ahead! Wiggle wiggle!', 'gl:k|{goal}! Bigger than your {old}! Ink-credible!', 'so:k|You\'re close! Count it again. You\'ve got this!'],
      e: ['fw:k|Your first win against me! Eight cheers for you!', 'w5:k|Win number {w}! I\'ll need more arms to count them!', 'sk:k|{streak} in a row! I\'m tied in a knot!',
        'gd:k|You\'re getting really good at {op}! Blub!', 'cb:k|What a comeback! You out-wiggled me!', 'pf:k|Every shake! Not even one of my eight arms could stop you!',
        'wn:k|{ks}–{os}! I\'ll write it in ink.', 're:b|Eight arms beat two! Rematch? Blub!', 're:k|Great game! Rematch? I\'ll warm up my arms.', 'so:k|You\'ll get me soon! You\'re learning faster than I can wiggle.', 'so:k|Good game! You\'re getting faster than my arms!', 'tie:k|A tie! Let\'s shake on it. With any arm.']
    },
    nugget: {
      g: ['lw:k|Welcome back, little knight! You beat me {ks}–{os}. I gave you a coin, remember?', 'll:b|ROAR! I won last time. My treasure pile got bigger!', 'll:k|Hello again, knight! Last match was a fine adventure.',
        'lt:k|A tie last time! We split the treasure.', 'sk:t|{streak} wins in a row? My treasure is getting nervous!', 'so:k|Little knight, you grow braver every match. I can see it.', 'so:k|Welcome back, brave knight! Every knight trains before finding the treasure.',
        'it:t|You beat me with {item} last time. I\'ve hidden my gold from it.', 'nw:k|Your Now! with {sol}. Shinier than my gold!', 'aw:k|{days} days! A dragon can wait a thousand years, but I\'m glad you\'re back.',
        'od:k|{n} matches, knight! Our record is {w}–{l}. That\'s a legend!', 'gl:k|Your Goal of {goal}! A golden Goal!', 'cup:t|You beat me in the Cup {cup}. I still look for that trophy in my cave.'],
      m: ['it:t|{Item}! I remember that one. Guard the gold!', 'sk:t|{next} in a row? Not while I guard this treasure!', 'rv:b|ROAR! I lead! My gold is safe today.', 'gl:k|{goal}! Bigger than your {old}. Shiny!', 'so:k|Courage, knight! The treasure is close.'],
      e: ['fw:k|Your first win against a dragon! Take a gold coin. You earned it!', 'w5:k|Win number {w}! You\'ve got quite a pile of my coins now.', 'sk:k|{streak} in a row! A dragon bows to you, knight.',
        'gd:k|You\'re getting really good at {op}. Worth more than gold!', 'cb:k|From behind to the win! A real knight\'s comeback!', 'pf:k|Every shake! Not one coin for the dragon. Wow!',
        'wn:k|{ks}–{os}. That score goes in my treasure book.', 're:b|ROAR! My treasure stays with me! Another try, knight?', 're:k|A fine battle! Rematch, little knight?', 'so:k|Don\'t give up, knight. You\'ll find my treasure soon. I\'m sure.', 'so:k|Well fought, little knight! The treasure is getting closer.', 'tie:k|A tie! We share the gold today.']
    },
    chroma: {
      g: ['lw:k|Challenger! You beat the Queen {ks}–{os}. My colours still blush.', 'll:b|The Queen won last time. In every colour. Again?', 'll:k|Welcome back to my court! Last match was most colourful.',
        'lt:k|A tie last time. Even the Queen could not change that.', 'sk:t|{streak} wins in a row? The Queen must change her colours!', 'so:k|Challenger, you grow stronger every match. The Queen notices.', 'so:k|Welcome back, challenger. The Queen admires a player who keeps coming back.',
        'it:t|You beat me with {item}. I have changed my colours since!', 'nw:k|Your Now! with {sol}. The whole court gasped.', 'aw:k|{days} days! The court changed colour twice while you were gone.',
        'od:k|{n} matches! The record is {w}–{l}. A rivalry in every colour.', 'cup:t|You beat me in the Cup {cup}. My crown changed colour from surprise.', 'ad:k|Your Solution {adm}, {adk}. The Queen admired it.'],
      m: ['it:t|{Item}! The Queen remembers. Not this time!', 'sk:t|{next} in a row? The Queen will change the rules on you!', 'rv:b|The Queen leads! My colours shine today.', 'gl:k|{goal}! Bigger than your {old}. Royal!', 'so:k|Keep going, challenger. Every colour has its day.'],
      e: ['fw:k|Your first win against the Queen! You saw through every colour!', 'w5:k|Win number {w} against the Queen! The court bows to you.', 'sk:k|{streak} in a row! The Queen admits it. You are the best.',
        'gd:k|You are getting very good at {op}, challenger. In every colour!', 'cb:k|From behind to victory! The court is cheering!', 'pf:k|Every shake! A perfect match! The Queen turns pale.',
        'wn:k|{ks}–{os}. The Queen will remember that colour.', 're:b|The Queen keeps her crown! A rematch, challenger?', 're:k|A beautiful match! Another?', 'so:k|Do not give up, challenger. The Queen can feel your win coming.', 'so:k|Well played, challenger. The Queen sees your colours getting brighter.', 'tie:k|A tie! Two crowns, one court.']
    }
  };
  var LINES = {};
  Object.keys(RAW).forEach(function (id) {
    LINES[id] = {};
    ['g', 'm', 'e'].forEach(function (part) {
      LINES[id][part] = RAW[id][part].map(function (s) { var bar = s.indexOf('|'), head = s.slice(0, bar).split(':'); return { c: head[0], tone: head[1], t: s.slice(bar + 1) }; });
    });
  });

  // ---------- facts -> template values ----------
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  var ADK = { long: 'so long and clever', frac: 'with a fraction in the middle', neg: 'dipping below zero' };
  function values(m, extra) {
    var v = {}, last = m.last || {}, r0 = Array.isArray(m.r) && m.r[0];
    if (r0) { v.ks = String(r0[1]); v.os = String(r0[2]); }
    v.w = String(m.w || 0); v.l = String(m.l || 0); v.n = String(m.n || 0);
    if (Math.abs(m.st || 0) >= 2) v.streak = String(Math.abs(m.st)); else if ((m.st || 0) >= 1 && extra && extra.endStreak) v.streak = String(m.st);
    if ((m.st || 0) >= 1) v.next = String(m.st + 1);
    var dd = daysBetween(m.d, dayStr()); if (dd >= 2) v.days = String(dd);
    if (Array.isArray(m.big) && m.big[1]) v.goal = v.old = String(m.big[1]);
    if (Array.isArray(m.adm) && m.adm[1]) { v.adm = String(m.adm[1]); v.adk = ADK[m.adm[0]] || ''; }
    if (last.sol) v.sol = String(last.sol);
    if (last.osol) v.osol = String(last.osol);
    var ip = itemPhrase(last.it); if (ip) v.item = ip;
    if (isObj(m.ms) && Array.isArray(m.ms.cup) && m.ms.cup[1]) v.cup = String(m.ms.cup[1]);
    if (Array.isArray(m.sea) && m.sea[0]) { v.pos = ord(+m.sea[0]); v.lg = LG[m.sea[1]] || ''; }
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k] != null && k !== 'endStreak') v[k] = String(extra[k]); });
    return v;
  }
  // Fill {placeholders}; null if any value is missing or empty (so a line never says "undefined").
  function fill(t, v) {
    var bad = false;
    var out = t.replace(/\{(\w+)\}/g, function (all, k) {
      var key = k.charAt(0).toLowerCase() + k.slice(1), x = v[key];
      if (x == null || x === '' || x === 'undefined' || x === 'null' || x === 'NaN') { bad = true; return ''; }
      x = String(x);
      return k.charAt(0) !== key.charAt(0) ? x.charAt(0).toUpperCase() + x.slice(1) : x;
    });
    return bad ? null : out;
  }
  function eligible(list, conds, v) {
    var out = [];
    list.forEach(function (L) { if (conds.indexOf(L.c) >= 0 && toneOk(L.tone)) { var s = fill(L.t, v); if (s) out.push({ c: L.c, tone: L.tone, s: s }); } });
    return out;
  }
  var lastSaid = {}, lastPick = null;
  function choose(id, cands) {
    if (!cands.length) return null;
    var pool = cands.length > 1 ? cands.filter(function (x) { return x.s !== lastSaid[id]; }) : cands;
    var x = pool[Math.floor(rand() * pool.length)] || pool[0];
    lastSaid[id] = x.s; lastPick = x;
    return x;
  }
  // Pick from the highest-priority conds that have a usable line (top `k` of them, mixed for variety).
  function pickBy(id, list, prio, v, k) {
    var got = [], used = 0;
    for (var i = 0; i < prio.length && used < k; i++) { var e = eligible(list, [prio[i]], v); if (e.length) { got = got.concat(e); used++; } }
    return choose(id, got);
  }
  var KIND_ONLY = ['so', 'aw', 'od', 'gl', 'ad'];
  function greetConds(m) {
    var last = m.last || {}, r0 = Array.isArray(m.r) && m.r[0], res = r0 ? r0[0] : '', st = m.st || 0, ms = isObj(m.ms) ? m.ms : {}, c = [];
    if (st <= -2) c.push('so');
    if (res === 'w' && last.how === 'now' && last.who === 'k' && last.sol) c.push('nw');
    if (res === 'w' && last.how === 'imp' && last.who === 'k') c.push('iw');
    if (res === 'w' && last.it) c.push('it');
    if (res === 'w' && last.cb) c.push('cb');
    if (res === 'w' && last.pf) c.push('pf');
    if (Array.isArray(ms.cup)) c.push('cup');
    if (ms.tr) c.push('tr');
    if (st >= 2) c.push('sk');
    if (res === 'l' && st > -2 && last.how === 'now' && last.who === 'o' && last.osol) c.push('ob');
    if (res === 'w') c.push('lw');
    if (res === 'l' && st > -2) c.push('ll');
    if (res === 't') c.push('lt');
    if (daysBetween(m.d, dayStr()) >= 7) c.push('aw');
    if (Array.isArray(m.sea) && +m.sea[0] >= 1 && +m.sea[0] <= 3) c.push('sea');
    if (Array.isArray(m.adm)) c.push('ad');
    if (Array.isArray(m.big)) c.push('gl');
    if ((m.n || 0) >= 10) c.push('od');
    // after two or more losses in a row: only the encouraging and neutral memories
    if (st <= -2) c = c.filter(function (x) { return KIND_ONLY.indexOf(x) >= 0; });
    return c;
  }
  var STRONG = { nw: 1, iw: 1, it: 1, cb: 1, pf: 1, cup: 1, tr: 1, sk: 1 };
  function lines(id) { return LINES[id] || null; }
  function restrictTone(m, list) { return (m.st || 0) <= -2 ? list.filter(function (L) { return L.tone === 'k'; }) : list; }

  function greet(i, opts) {
    try {
      var m = mem(i), o = opps()[i], L = o && lines(o.id);
      if (!m || !L || !(m.n > 0)) return '';
      var conds = greetConds(m); if (!conds.length) return '';
      var strong = conds.some(function (c) { return STRONG[c]; });
      if (!(opts && opts.always) && rand() > (strong ? 0.75 : 0.45)) return '';
      var x = pickBy(o.id + ':g', restrictTone(m, L.g), conds, values(m), 3);
      return x ? x.s : '';
    } catch (e) { return ''; }
  }

  // ctx: {g, sym} after a cube move, {g, goal: 1} after he sets the Goal. At most 2 per match, 1 per shake.
  function midLine(i, ctx, opts) {
    try {
      ctx = ctx || {};
      var m = mem(i), o = opps()[i], L = o && lines(o.id), g = ctx.g || (typeof G !== 'undefined' ? G : null);
      if (!m || !L || !g) return '';
      var c = ensureCur(g);
      if (!(opts && opts.always) && (c.mid.n >= MID_MAX || c.mid.shake === g.shake)) return '';
      var seat = -1; (g.players || []).forEach(function (p, k) { if (k > 0 && p.ai && oppIndexOf(p.ai) === i) seat = k; });
      var me = g.players && g.players[0] ? +g.players[0].score || 0 : 0, it = seat > 0 ? +g.players[seat].score || 0 : 0;
      var last = m.last || {}, r0 = Array.isArray(m.r) && m.r[0], st = m.st || 0, conds = [], extra = {};
      if (ctx.goal && g.setter === 0 && Array.isArray(m.big)) { var gv = goalNum(g.goal); if (gv != null && gv > m.big[0]) { conds.push('gl'); extra.goal = goalText(g.goal); extra.old = String(m.big[1]); } }
      if (st <= -2 && it > me) conds.push('so');
      if (st > -2 && r0 && r0[0] === 'w' && itemMatches(last.it, ctx.sym, ctx.goal ? g.vari : null)) conds.push('it');
      if (st >= 2 && g.shake === g.shakes && me > it) conds.push('sk');
      if (r0 && r0[0] === 'w' && it > me) conds.push('rv');
      if (!conds.length) return '';
      if (!(opts && opts.always) && rand() > 0.6) return '';
      var x = pickBy(o.id + ':m', restrictTone(m, L.m), conds, values(m, extra), 1);
      if (!x) return '';
      c.mid.n++; c.mid.shake = g.shake;
      return x.s;
    } catch (e) { return ''; }
  }

  // After note('end'): the creature's last word on the match. res is 'w' | 'l' | 't' (his result); default: the memory's.
  var MILESTONE = { fw: 1, w5: 1, sk: 1, cb: 1, pf: 1, so: 1 };
  function endLine(i, res, opts) {
    try {
      var m = mem(i), o = opps()[i], L = o && lines(o.id);
      if (!m || !L || !Array.isArray(m.r) || !m.r[0]) return '';
      res = typeof res === 'string' ? res : isObj(res) ? (res.won ? 'w' : res.tie ? 't' : 'l') : m.r[0][0];
      var last = m.last || {}, st = m.st || 0, conds = [], extra = {};
      if (res === 'w') {
        if (m.w === 1) conds.push('fw');
        if (last.pf) conds.push('pf');
        if (last.cb) conds.push('cb');
        if (m.w >= 5 && m.w % 5 === 0) conds.push('w5');
        if (st >= 3) conds.push('sk');
        var bestK = null; (last.k || []).forEach(function (k) { var n = isObj(m.ops) ? m.ops[k] || 0 : 0; if (n >= 3 && keyWords(k) && (!bestK || n > m.ops[bestK])) bestK = k; });
        if (bestK) { conds.push('gd'); extra.op = keyWords(bestK); }
        conds.push('wn');
      } else if (res === 'l') conds.push(st <= -2 ? 'so' : 're');
      else conds.push('tie');
      var top = conds[0];
      if (!(opts && opts.always) && !MILESTONE[top] && rand() > (top === 'gd' ? 0.7 : 0.5)) return '';
      var x = pickBy(o.id + ':e', restrictTone(m, L.e), conds, values(m, Object.assign({ endStreak: 1 }, extra)), MILESTONE[top] && top !== 'so' && top !== 'fw' ? 2 : 1);
      return x ? x.s : '';
    } catch (e) { return ''; }
  }

  // ---------- rival status and history (picker card, Career screen) ----------
  function level(i) {
    var m = mem(i), n = m ? m.n || 0 : 0, k = 0;
    for (var j = 0; j < LEVELS.length; j++) if (n >= LEVELS[j].min) k = j;
    var nx = LEVELS[k + 1];
    return { k: k, name: LEVELS[k].name, icon: LEVELS[k].icon, n: n, toNext: nx ? nx.min - n : 0, nextName: nx ? nx.name : '' };
  }
  function ago(d) { var n = daysBetween(d, dayStr()); return n === 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago'; }
  // kind wording: a loss is told as the creature's win ("Penny won 12–6"), never "you lost"
  function resWords(r, name) { return !r ? '' : r[0] === 'w' ? 'you won ' + r[1] + '–' + r[2] : r[0] === 'l' ? (name || 'it') + ' won ' + r[2] + '–' + r[1] : 'a tie, ' + r[1] + '–' + r[2]; }
  // One remembered moment, in plain words (not the creature's voice).
  function moment(m) {
    var last = m.last || {}, ms = isObj(m.ms) ? m.ms : {}, r0 = m.r && m.r[0];
    if (r0 && r0[0] === 'w' && last.how === 'now' && last.who === 'k' && last.sol) return 'your Now! with ' + last.sol;
    if (r0 && r0[0] === 'w' && last.it && itemPhrase(last.it)) return 'your win with ' + itemPhrase(last.it);
    if (Array.isArray(ms.cup)) return 'you beat it in the Cup ' + ms.cup[1];
    if (ms.tr) return 'your crown at the table of three';
    if (ms.pf) return 'your perfect match (every shake!)';
    if (ms.cb) return 'your comeback from behind';
    if (Array.isArray(m.adm)) return 'your Solution ' + m.adm[1];
    if (Array.isArray(m.big)) return 'your Goal of ' + m.big[1];
    if (ms.fw) return 'your first win';
    return '';
  }
  function cardLineHTML(i) {
    var m = mem(i), lv = level(i);
    if (!m || !m.n) return '<div class="rv-card rv-l0"><span class="rv-lvl">' + lv.icon + ' ' + lv.name + '</span></div>';
    var r0 = m.r && m.r[0];
    return '<div class="rv-card rv-l' + lv.k + '"><span class="rv-lvl">' + lv.icon + ' ' + E(lv.name) + '</span> <span class="rv-rec">' + (m.w || 0) + '–' + (m.l || 0) + (m.t ? '–' + m.t : '') + '</span>' +
      (r0 ? '<small>Last: ' + E(resWords(r0, opps()[i] && opps()[i].name)) + '</small>' : '') + '</div>';
  }
  function historyHTML(i) {
    var m = mem(i), o = opps()[i], lv = level(i); if (!o) return '';
    var face = typeof avatarHTML === 'function' ? avatarHTML(o, '') : '<span class="avatar">' + o.emoji + '</span>';
    if (!m || !m.n) return '<div class="rv-hist rv-l0">' + face + '<div class="rv-hbody"><b>' + E(o.name) + '</b> <span class="rv-lvl">' + lv.icon + ' ' + lv.name + '</span><small>You haven\'t played yet.</small></div></div>';
    var r0 = m.r[0], mo = moment(m), st = m.st || 0;
    var dots = (m.r || []).slice().reverse().map(function (r) { return '<i class="rv-dot ' + (r[0] === 'w' ? 'w' : r[0] === 'l' ? 'l' : 't') + '" title="' + E(resWords(r, o.name)) + '"></i>'; }).join('');
    var streak = st >= 2 ? ' · 🔥 ' + st + ' wins in a row' : '';
    return '<div class="rv-hist rv-l' + lv.k + '">' + face + '<div class="rv-hbody"><b>' + E(o.name) + '</b> <span class="rv-lvl">' + lv.icon + ' ' + E(lv.name) + '</span>' +
      '<small class="rv-line">' + (m.w || 0) + ' won · ' + (m.l || 0) + ' lost' + (m.t ? ' · ' + m.t + ' tied' : '') + streak + '</small>' +
      '<small class="rv-line">Last time (' + ago(m.d) + '): ' + E(resWords(r0, o.name)) + '</small>' +
      (mo ? '<small class="rv-line rv-mo">💭 ' + E(o.name) + ' remembers ' + E(mo) + '</small>' : '') +
      '<span class="rv-dots" aria-hidden="true">' + dots + '</span>' +
      (lv.toNext ? '<small class="rv-next">' + lv.toNext + ' more match' + (lv.toNext === 1 ? '' : 'es') + ' to ' + E(lv.nextName) + '</small>' : '') + '</div></div>';
  }
  function careerHTML() {
    var played = []; opps().forEach(function (o, i) { var m = mem(i); if (m && m.n) played.push({ i: i, n: m.n, d: m.d || '' }); });
    played.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : b.n - a.n; });
    return '<div class="rv-sec"><h3 class="rv-h">🤝 Rivals <small>creatures remember your matches</small></h3>' +
      (played.length ? '<div class="rv-list">' + played.map(function (p) { return historyHTML(p.i); }).join('') + '</div>'
        : '<p class="car-small">Play a creature and it will start to remember your matches together.</p>') + '</div>';
  }
  function bytes() { try { return JSON.stringify(store()).length; } catch (e) { return 0; } }

  // ---------- the cloud-save merge rule (copied verbatim into js/account.js RULES.rivals; see docs/handoff/rivals.md) ----------
  /*RIVALS-MERGE-START*/
  function rivalsMerge(a, b) {
    var isO = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    var cp = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
    a = isO(a) ? a : {}; b = isO(b) ? b : {};
    var out = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (id) {
      if (id in out) return;
      var x = a[id], y = b[id];
      if (!isO(x) || !isO(y)) { out[id] = cp(isO(x) ? x : isO(y) ? y : (x !== undefined ? x : y)); return; }
      // the side that played more matches against this creature wins; same count: the later day
      var nx = +x.n || 0, ny = +y.n || 0, useX = nx !== ny ? nx > ny : String(x.d || '') >= String(y.d || '');
      var w = cp(useX ? x : y), o = useX ? y : x;
      w.bs = Math.max(+x.bs || 0, +y.bs || 0);
      w.f = x.f && y.f ? (String(x.f) < String(y.f) ? x.f : y.f) : (x.f || y.f);
      // milestones: union, earliest day for each
      var ms = isO(w.ms) ? w.ms : {}, om = isO(o.ms) ? o.ms : {};
      Object.keys(om).forEach(function (k) {
        var p = ms[k], q = om[k], dp = Array.isArray(p) ? p[0] : p, dq = Array.isArray(q) ? q[0] : q;
        if (p === undefined || (dq && dp && String(dq) < String(dp))) ms[k] = cp(q);
      });
      w.ms = ms;
      if (Array.isArray(o.big) && (!Array.isArray(w.big) || +o.big[0] > +w.big[0])) w.big = cp(o.big);
      if (Array.isArray(o.adm) && (!Array.isArray(w.adm) || +o.adm[2] > +w.adm[2])) w.adm = cp(o.adm);
      out[id] = w;
    });
    return out;
  }
  /*RIVALS-MERGE-END*/

  return {
    note: note, greet: greet, midLine: midLine, endLine: endLine,
    level: level, cardLineHTML: cardLineHTML, historyHTML: historyHTML, careerHTML: careerHTML, bytes: bytes,
    merge: rivalsMerge, LINES: LINES, LEVELS: LEVELS,
    _x: { solFacts: solFacts, itemOf: itemOf, itemPhrase: itemPhrase, keyWords: keyWords, values: values, fill: fill, greetConds: greetConds, moment: moment,
      setRandom: function (f) { rand = f || Math.random; }, reset: function () { cur = null; lastSaid = {}; }, cur: function () { return cur; }, last: function () { return lastPick; } }
  };
})();
