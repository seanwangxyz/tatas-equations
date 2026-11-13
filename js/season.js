'use strict';
// ======================= SEASON TABLE =======================
// A friendly league table for each league (Classic: creatures 0-4, Monster League: creatures 5-9, CAREER: Legend League 10-14).
// Skill-based and never punishing:
//   - A one-on-one match against a creature (also a Cup round) is a FIXTURE: win 3 points, tie 1, loss 0, for both
//     sides. Goals are shake points: "For" = his shake points, "Against" = the creature's.
//   - A season = he plays every creature of that league twice (10 fixtures). A third match against the same creature
//     in one season is a friendly: everything else in the game counts as usual, only the table stays as it is.
//   - After each of his fixtures, two creature-vs-creature fixtures are played (simulated from the creatures' stars),
//     so by the end everyone has played 10 (a full double round robin of the creatures, plus their 2 games with him).
//   - After his 10th fixture: a season-end ceremony (final place, XP and a pennant for EVERY place), and the next
//     season starts at once. He can never be relegated, and nothing he has won can ever be lost.
//   - No timers, no streak counters, no daily anything. A season lasts as long as he likes.
//
// Public API:
//   Season.onMatch({oppIdx, you, them, won, tie, mode})  call from endMatch (mode 'ai' or 'cup'); returns a result
//                                                        object (or null if it did not count) and gives season XP
//   Season.lineHTML(res)      a compact "table moved" line for the match-end pop-up (res from onMatch; default: last)
//   Season.open(lg)           show the Season screen (#season); lg 'c' | 'm' | 'l' (default: the league played last)
//   Season.buttonHTML()       a menu button that opens it (for the title / Trophy Room)
//   Season.pennants()         [{lg, n, place, pts, kind, date}] newest first (for the trophy cabinet)
//   Season.pennantSVG(kind, label, px)
//   Season.state(), Season.table(lgId)   read-only views (tests, cabinet)
//   Season._core              the pure logic (tests/engine.test.js)
// Tap handlers added: ACT.season (open the screen), ACT.seasonPeek (the table in a pop-up over the match-end pop-up,
// which comes back when it closes), ACT.seasonTab, ACT.seasonCeremony, ACT.seasonCeremonyDone, ACT.seasonBack.
//
// Save shape (S.season), small and capped:
//   { v: 1, last: 'c',
//     c: League, m: League, l: League,            // the season in progress of each league (l = Legend League, CAREER)
//     hist: [{lg, n, place, pts, w, d, l, f, a, date}],   // finished seasons, newest last, at most 40 kept
//     won: {gold, silver, bronze, blue},          // pennant counts for life: these only ever go up
//     cer: null | {lg, n, place, pts, xp, kind, top: [[row, pts], ...]} }   // a ceremony waiting to be shown
//   League = { n, seed, t: [[P,W,D,L,F,A] x6], f: [form x6 ('WDL', at most 5)], pl: [his games vs each creature x5],
//              k: his fixtures played (0..10), sim: creature fixtures played (0..20), last: {...} | null }
//   Row 0 is the kid, rows 1..5 are the league's creatures in OPPONENTS order.
var Season = (function () {
  var TEAMS = 5, GAMES_EACH = 2, MY_GAMES = TEAMS * GAMES_EACH, SIM_GAMES = TEAMS * (TEAMS - 1), FORM_N = 5, HIST_CAP = 40;
  var LEAGUES = { c: { id: 'c', name: 'Classic League', first: 0, icon: '⚽' }, m: { id: 'm', name: 'Monster League', first: 5, icon: '👹' }, l: { id: 'l', name: 'Legend League', first: 10, icon: '🌟' } };
  // CAREER: the leagues that exist in this game (the Legend League only when OPPONENTS has its five creatures)
  function ids() { return ['c', 'm', 'l'].filter(function (k) { return k !== 'l' || opps().length >= LEAGUES.l.first + TEAMS; }); }
  function lgOf(oppIdx) { return oppIdx >= LEAGUES.l.first ? 'l' : oppIdx >= LEAGUES.m.first ? 'm' : 'c'; }
  function okId(lg) { return lg === 'c' || lg === 'm' || lg === 'l'; }
  // reward by final place (index 0 = 1st). Every place gets a pennant.
  var REWARDS = [
    { kind: 'gold', xp: 150, title: 'Champions!', line: 'You won the league!' },
    { kind: 'silver', xp: 100, title: 'Runners-up!', line: 'Second in the whole league!' },
    { kind: 'bronze', xp: 75, title: 'Third place!', line: 'On the podium!' },
    { kind: 'blue', xp: 50, title: 'Season finished!', line: 'You played the whole season!' }
  ];
  var PEN = { gold: ['#ffd84a', '#c98a00'], silver: ['#eef2f7', '#8a96a8'], bronze: ['#f2b27a', '#a35a21'], blue: ['#7cc0ff', '#1f63c9'] };

  // ---------- tiny helpers (safe when other files are missing, e.g. in tests) ----------
  function opps() { return typeof OPPONENTS !== 'undefined' ? OPPONENTS : []; }
  function opp(i) { return opps()[i] || { name: '?', emoji: '?', color: '#eee', stars: 3 }; }
  function E(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function I(n) { return typeof ico === 'function' ? ico(n) : ''; }
  function save() { if (typeof persist === 'function') persist(); }
  function dayStr() { if (typeof today === 'function') return today(); var d = new Date(); return d.toISOString().slice(0, 10); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function snd(name) { try { if (typeof Snd !== 'undefined' && Snd && typeof Snd[name] === 'function') Snd[name](); } catch (e) {} }

  // ---------- pure logic ----------
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash() { var h = 2166136261; for (var i = 0; i < arguments.length; i++) { var s = String(arguments[i]); for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619); } h ^= 124; h = Math.imul(h, 16777619); } return h >>> 0; }
  function newLeague(lg, n) {
    var t = [], f = [], pl = [];
    for (var r = 0; r <= TEAMS; r++) { t.push([0, 0, 0, 0, 0, 0]); f.push(''); }
    for (var c = 0; c < TEAMS; c++) pl.push(0);
    return { n: n, seed: hash('season', lg, n), t: t, f: f, pl: pl, k: 0, sim: 0, last: null };
  }
  // the 20 creature fixtures of a season (every pair twice, home and away): a round robin (circle method, one
  // creature resting each round) in 10 rounds of 2 fixtures, so one round is played after each fixture of his and
  // the creatures' games played never differ by more than one. Who meets whom when comes from the season's seed.
  function fixtures(L) {
    var R = rng(L.seed), t = [], i, j, x, out = [], half = [];
    for (i = 1; i <= TEAMS; i++) t.push(i);
    for (i = t.length - 1; i > 0; i--) { j = Math.floor(R() * (i + 1)); x = t[i]; t[i] = t[j]; t[j] = x; }
    var arr = t.concat(TEAMS % 2 ? [0] : []), n = arr.length;   // 0 = resting
    for (var r = 0; r < n - 1; r++) {
      for (i = 0; i < n / 2; i++) { var a = arr[i], b = arr[n - 1 - i]; if (a && b) half.push(r % 2 ? [b, a] : [a, b]); }
      arr = [arr[0]].concat([arr[n - 1]], arr.slice(1, n - 1));
    }
    half.forEach(function (p) { out.push(p); });
    half.forEach(function (p) { out.push([p[1], p[0]]); });
    return out;
  }
  // creature strength: its stars, a bit more for the fire ones (Hex, King Messy)
  function strength(oi) { var o = opp(oi); return (o.stars || 3) + 0.6 * (o.fire || 0); }
  // one simulated match: each shake goes to one side (chance from the strength gap) for 2, 4 or 6 shake points
  function simMatch(sa, sb, seed, shakes) {
    var R = rng(seed), p = 1 / (1 + Math.exp(-(sa - sb) * 0.55)), ga = 0, gb = 0;
    for (var s = 0; s < (shakes || 3); s++) {
      var x = R(), pts = x < 0.5 ? 2 : x < 0.8 ? 4 : 6;
      if (R() < p) ga += pts; else gb += pts;
    }
    return [ga, gb];
  }
  function record(L, r, gf, ga) {
    var row = L.t[r], res = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    row[0]++; row[res === 'W' ? 1 : res === 'D' ? 2 : 3]++; row[4] += gf; row[5] += ga;
    L.f[r] = (L.f[r] + res).slice(-FORM_N);
  }
  function pts(row) { return row[1] * 3 + row[2]; }
  // sorted table: points, then shake-point difference, then shake points scored; a full tie lists the kid first
  function table(L) {
    var rows = L.t.map(function (row, r) { return { r: r, P: row[0], W: row[1], D: row[2], L: row[3], F: row[4], A: row[5], pts: pts(row), form: L.f[r] }; });
    rows.sort(function (x, y) { return (y.pts - x.pts) || ((y.F - y.A) - (x.F - x.A)) || (y.F - x.F) || (x.r - y.r); });
    return rows;
  }
  function placeOf(L, r) { var tb = table(L); for (var i = 0; i < tb.length; i++) if (tb[i].r === (r || 0)) return i + 1; return tb.length; }
  function rewardFor(place) { return REWARDS[Math.min(place, 4) - 1]; }
  function blank() { return { v: 1, last: 'c', c: newLeague('c', 1), m: newLeague('m', 1), l: newLeague('l', 1), hist: [], won: { gold: 0, silver: 0, bronze: 0, blue: 0 }, cer: null }; }
  function okLeague(L) { return L && typeof L === 'object' && Array.isArray(L.t) && L.t.length === TEAMS + 1 && Array.isArray(L.f) && Array.isArray(L.pl) && L.pl.length === TEAMS && L.n >= 1; }
  function normalize(st) {
    if (!st || typeof st !== 'object' || Array.isArray(st)) st = blank();
    ['c', 'm', 'l'].forEach(function (lg) { if (!okLeague(st[lg])) st[lg] = newLeague(lg, 1); }); // (CAREER: an older save gets a fresh Legend League)
    if (!Array.isArray(st.hist)) st.hist = [];
    if (!st.won || typeof st.won !== 'object') st.won = {};
    ['gold', 'silver', 'bronze', 'blue'].forEach(function (k) { st.won[k] = Math.max(0, st.won[k] | 0); });
    if (!okId(st.last)) st.last = 'c';
    st.v = 1;
    return st;
  }
  // His match. opts: {shakes, date, xp(n, why)}. Pure apart from opts.xp. Returns the result (also kept in L.last).
  function play(st, oppIdx, you, them, opts) {
    opts = opts || {};
    var lg = lgOf(oppIdx), L = st[lg], c = oppIdx - LEAGUES[lg].first, r = c + 1;
    if (c < 0 || c >= TEAMS) return null;
    st.last = lg;
    var name = opp(oppIdx).name;
    var res = { lg: lg, n: L.n, opp: oppIdx, you: you, them: them, friendly: false, before: placeOf(L, 0), ptsBefore: pts(L.t[0]), sim: [], ended: null };
    if (L.pl[c] >= GAMES_EACH) {
      res.friendly = true; res.after = res.before; res.ptsAfter = res.ptsBefore; res.k = L.k;
      L.last = { friendly: true, opp: oppIdx, before: res.before, after: res.after, gained: 0, k: L.k };
      return res;
    }
    L.pl[c]++; L.k++;
    record(L, 0, you, them); record(L, r, them, you);
    // the creatures' own fixtures: catch up to 2 per fixture of his
    var fx = fixtures(L), target = Math.round(SIM_GAMES * L.k / MY_GAMES);
    while (L.sim < target && L.sim < fx.length) {
      var p = fx[L.sim], oa = LEAGUES[lg].first + p[0] - 1, ob = LEAGUES[lg].first + p[1] - 1;
      var sc = simMatch(strength(oa), strength(ob), hash(L.seed, 'fx', L.sim), opts.shakes || 3);
      record(L, p[0], sc[0], sc[1]); record(L, p[1], sc[1], sc[0]);
      res.sim.push([oa, ob, sc[0], sc[1]]);
      L.sim++;
    }
    res.after = placeOf(L, 0); res.ptsAfter = pts(L.t[0]); res.k = L.k;
    L.last = { friendly: false, opp: oppIdx, before: res.before, after: res.after, gained: res.ptsAfter - res.ptsBefore, k: L.k, sim: res.sim.slice(0, 2) };
    if (L.k >= MY_GAMES) {
      // season over: archive it, reward the place, start the next one
      var place = res.after, rw = rewardFor(place), row = L.t[0], tb = table(L);
      var h = { lg: lg, n: L.n, place: place, pts: pts(row), w: row[1], d: row[2], l: row[3], f: row[4], a: row[5], date: opts.date || '' };
      st.hist.push(h); if (st.hist.length > HIST_CAP) st.hist.splice(0, st.hist.length - HIST_CAP);
      st.won[rw.kind] = (st.won[rw.kind] | 0) + 1;
      st.cer = { lg: lg, n: L.n, place: place, pts: h.pts, xp: rw.xp, kind: rw.kind, top: tb.map(function (x) { return [x.r === 0 ? -1 : LEAGUES[lg].first + x.r - 1, x.pts]; }) };
      res.ended = st.cer;
      if (opts.xp) opts.xp(rw.xp, LEAGUES[lg].name + ' season ' + L.n + ': ' + ord(place) + ' place!');
      st[lg] = newLeague(lg, L.n + 1);
    }
    return res;
  }

  // ---------- the game side ----------
  function state() { if (typeof S === 'undefined') return blank(); S.season = normalize(S.season); return S.season; }
  var lastRes = null;
  function onMatch(m) {
    if (!m || m.oppIdx == null || m.oppIdx < 0) return null;
    if (m.mode && m.mode !== 'ai' && m.mode !== 'cup') return null;   // people, Team-up, Three at the table: not league fixtures
    var st = state();
    var shakes = (typeof S !== 'undefined' && S.set && S.set.shakes) || 3;
    var res = play(st, +m.oppIdx, +m.you || 0, +m.them || 0, { shakes: shakes, date: dayStr(), xp: function (n, why) { if (typeof addXP === 'function') addXP(n, why); } });
    save();
    lastRes = res;
    return res;
  }
  // a short, always-kind sentence about the table
  function moveText(res) {
    if (!res) return '';
    var lgName = LEAGUES[res.lg].name, o = opp(res.opp);
    if (res.ended) {
      var rw = rewardFor(res.ended.place);
      return '🏁 Season ' + res.ended.n + ' is over: you finished <b>' + ord(res.ended.place) + '</b> in the ' + lgName + '! ' + rw.line;
    }
    if (res.friendly) return '🤝 Friendly match: you already played ' + E(o.name) + ' twice this season. Play another creature for your next ' + lgName + ' fixture.';
    var gained = res.ptsAfter - res.ptsBefore, gp = gained === 3 ? '+3 points' : gained === 1 ? '+1 point' : 'Fixture played';
    var where;
    if (res.after < res.before) where = 'up to <b>' + ord(res.after) + '</b>!';
    else if (res.after === 1) where = 'top of the table!';
    else where = '<b>' + ord(res.after) + '</b> in the ' + lgName + '.';
    var left = MY_GAMES - res.k;
    return '📊 ' + gp + ', ' + (res.after < res.before ? 'you moved ' : 'you are ') + where + ' <span class="sea-left">' + left + ' fixture' + (left === 1 ? '' : 's') + ' left this season.</span>';
  }
  function lineHTML(res) {
    res = res === undefined ? lastRes : res;
    if (!res) return '';
    var st = state();
    return '<div class="sea-line">' + moveText(res) +
      '<div class="sea-line-btns">' + (st.cer ? '<button class="btn small yellow" data-act="seasonCeremony">🏆 Season ceremony</button>' : '') +
      '<button class="btn small" data-act="seasonPeek" data-arg="' + res.lg + '">' + I('chart') + ' Table</button></div></div>';
  }
  function buttonHTML(cls) { return '<button class="btn ' + (cls || 'big blue') + '" data-act="season">' + I('chart') + ' Season Table</button>'; }
  function pennants() {
    return state().hist.slice().reverse().map(function (h) { return { lg: h.lg, n: h.n, place: h.place, pts: h.pts, kind: rewardFor(h.place).kind, date: h.date, league: LEAGUES[h.lg].name }; });
  }
  function pennantSVG(kind, label, px) {
    var c = PEN[kind] || PEN.blue, w = px || 64, uid = 'pn' + Math.floor(Math.random() * 1e9);
    return '<svg class="sea-pen" width="' + w + '" height="' + Math.round(w * 0.8) + '" viewBox="0 0 100 80" aria-hidden="true">' +
      '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>' +
      '<rect x="4" y="4" width="5" height="74" rx="2.5" fill="#7a5230"/><path d="M9 8 L96 30 L9 52 Z" fill="url(#' + uid + ')" stroke="rgba(0,0,0,.25)" stroke-width="2" stroke-linejoin="round"/>' +
      (label ? '<text x="40" y="34" text-anchor="middle" font-family="Lilita One, Trebuchet MS, sans-serif" font-size="15" fill="' + (kind === 'silver' ? '#3d4768' : '#fff') + '" stroke="rgba(0,0,0,.25)" stroke-width="' + (kind === 'silver' ? 0 : 0.6) + '">' + E(label) + '</text>' : '') + '</svg>';
  }

  // ---------- the Season screen ----------
  var tab = null;
  function teamCell(lg, r) {
    if (r === 0) {
      var nm = typeof S !== 'undefined' ? S.name : 'You', num = typeof S !== 'undefined' ? (S.jersey || '7') : '7';
      return '<span class="sea-me">' + E(num) + '</span><span class="sea-nm">' + E(nm) + ' <small>(you)</small></span>';
    }
    var oi = LEAGUES[lg].first + r - 1, o = opp(oi);
    return (typeof avatarHTML === 'function' ? avatarHTML(o, 'sm') : '<span>' + o.emoji + '</span>') + '<span class="sea-nm">' + E(o.name) + '</span>';
  }
  function formHTML(f) {
    var out = '';
    for (var i = 0; i < FORM_N; i++) { var ch = f.charAt(i); out += '<i class="sea-f ' + (ch ? 'f' + ch : 'f-') + '" title="' + (ch === 'W' ? 'win' : ch === 'D' ? 'tie' : ch === 'L' ? 'loss' : 'not played yet') + '">' + (ch || '') + '</i>'; }
    return '<span class="sea-form">' + out + '</span>';
  }
  function tableHTML(lg) {
    var L = state()[lg], tb = table(L);
    return '<div class="sea-tablewrap"><table class="sea-table"><thead><tr><th>#</th><th class="tl">Team</th><th class="sea-p">P</th><th>W</th><th>D</th><th>L</th><th class="sea-fa">For</th><th class="sea-fa">Agst</th><th>Pts</th><th class="sea-fh">Last 5</th></tr></thead><tbody>' +
      tb.map(function (x, i) {
        return '<tr class="' + (x.r === 0 ? 'me' : '') + (i === 0 && x.P ? ' top' : '') + '"><td class="pos">' + (i + 1) + '</td><td class="tl team">' + teamCell(lg, x.r) + '</td><td class="sea-p">' + x.P + '</td><td>' + x.W + '</td><td>' + x.D + '</td><td>' + x.L + '</td><td class="sea-fa">' + x.F + '</td><td class="sea-fa">' + x.A + '</td><td class="pts">' + x.pts + '</td><td class="sea-fh">' + formHTML(x.form) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function fixturesHTML(lg) {
    var L = state()[lg], first = LEAGUES[lg].first, out = '';
    for (var c = 0; c < TEAMS; c++) {
      var oi = first + c, o = opp(oi), open = typeof oppOpen === 'function' ? oppOpen(oi) : true, dots = '';
      for (var k = 0; k < GAMES_EACH; k++) dots += '<i class="sea-dot' + (k < L.pl[c] ? ' on' : '') + '"></i>';
      var done = L.pl[c] >= GAMES_EACH;
      out += '<div class="sea-fx' + (open ? '' : ' lock') + (done ? ' done' : '') + '"' + (open && !done && typeof ACT !== 'undefined' && ACT.playOpp ? ' data-act="playOpp" data-arg="' + oi + '"' : '') + '>' +
        (typeof avatarHTML === 'function' ? avatarHTML(o, 'sm') : o.emoji) + '<b>' + E(o.name) + '</b><span class="sea-dots">' + dots + '</span>' +
        '<small>' + (done ? 'Both played ' + I('check') : open ? 'Tap to play' : I('lock') + ' Unlock first') + '</small></div>';
    }
    return out;
  }
  function render(lg) {
    var st = state(); lg = okId(lg) && ids().indexOf(lg) >= 0 ? lg : (tab || st.last || 'c'); tab = lg;
    var L = st[lg], pl = placeOf(L, 0);
    var tabs = ids().map(function (k) { return '<button class="btn small' + (k === lg ? ' green' : '') + '" data-act="seasonTab" data-arg="' + k + '">' + LEAGUES[k].icon + ' ' + LEAGUES[k].name + '</button>'; }).join('');
    var won = st.won, wonN = won.gold + won.silver + won.bronze + won.blue;
    var hist = st.hist.slice().reverse().slice(0, 12).map(function (h) {
      var rw = rewardFor(h.place);
      return '<div class="sea-hist">' + pennantSVG(rw.kind, ord(h.place), 54) + '<div><b>' + LEAGUES[h.lg].name + ', season ' + h.n + '</b><small>' + ord(h.place) + ' place · ' + h.pts + ' points · ' + h.w + ' won, ' + h.d + ' tied' + (h.date ? ' · ' + E(h.date) : '') + '</small></div></div>';
    }).join('');
    var html = '<div class="hdr"><button class="btn small" data-act="seasonBack">' + I('back') + ' Back</button><h2>' + I('chart') + ' Season Table</h2></div>' +
      '<div class="panel sea-panel"><div class="sea-tabs row">' + tabs + '</div>' +
      '<div class="sea-head"><div><div class="sea-title">' + LEAGUES[lg].name + ' · Season ' + L.n + '</div><small>Fixture ' + Math.min(L.k + 1, MY_GAMES) + ' of ' + MY_GAMES + ' · you are ' + ord(pl) + (L.k ? '' : ' (the season has just started!)') + '</small></div>' +
      '<div class="sea-prog"><i style="width:' + Math.round(100 * L.k / MY_GAMES) + '%"></i></div></div>' +
      (st.cer ? '<div class="row" style="margin:6px 0 10px"><button class="btn yellow" data-act="seasonCeremony">🏆 Your season ceremony is ready!</button></div>' : '') +
      tableHTML(lg) +
      '<h3 class="tierh">' + I('play') + ' Your fixtures <small>play each creature twice</small></h3><div class="sea-fxs">' + fixturesHTML(lg) + '</div>' +
      '<details class="sea-rules"><summary>How does the season work?</summary><ul>' +
      '<li>Every match against a creature in this league is a fixture: a win is 3 points, a tie 1 point.</li>' +
      '<li>"For" and "Agst" are shake points: the points you and the creatures scored.</li>' +
      '<li>The creatures play each other too, so the table moves after every one of your fixtures.</li>' +
      '<li>Play each creature twice. A third match against the same creature is a friendly.</li>' +
      '<li>After your 10th fixture there is a season ceremony: every place wins a pennant and XP. Then a new season starts.</li>' +
      '<li>You can never go down a league or lose anything. Take as long as you like!</li></ul></details>' +
      '<h3 class="tierh">🚩 My pennants <small>' + wonN + ' won</small></h3>' +
      (hist ? '<div class="sea-hists">' + hist + '</div>' : '<p class="sea-empty">Finish your first season to hang your first pennant here.</p>') +
      '</div>';
    var el = typeof document !== 'undefined' && document.getElementById('season');
    if (el) el.innerHTML = html;
    return html;
  }
  var backTo = 'title';
  function open(lg) {
    if (typeof current !== 'undefined' && current && current !== 'season') backTo = current;
    render(lg);
    if (typeof go === 'function') go('season');
    if (state().cer) setTimeout(ceremony, 350);
  }
  // A pop-up shown on top of another pop-up (the match-end one): when it closes, the one below comes back as it was.
  function prevModal() { var m = document.getElementById('modal'), b = document.getElementById('modalBox'); return m && b && m.classList.contains('on') ? b.innerHTML : null; }
  function restore(prev) { if (prev && typeof modal === 'function') modal(prev.replace(/<button[^>]*data-act="seasonCeremony"[^>]*>[\s\S]*?<\/button>/g, ''), null); }
  function peek(lg) {
    if (typeof modal !== 'function') return;
    var prev = prevModal(), st = state(); lg = okId(lg) ? lg : st.last;
    var L = st[lg];
    modal('<h2>' + LEAGUES[lg].icon + ' ' + LEAGUES[lg].name + '</h2><p style="text-align:center;margin:0 0 8px">Season ' + L.n + ' · fixture ' + Math.min(L.k + 1, MY_GAMES) + ' of ' + MY_GAMES + '</p>' + tableHTML(lg) +
      '<div class="row" style="margin-top:12px"><button class="btn green" data-act="closeModal">OK</button></div>', prev ? function () { restore(prev); } : null);
  }
  function ceremony() {
    var st = state(), c = st.cer; if (!c || typeof modal !== 'function') return;
    var prev = prevModal();
    var rw = rewardFor(c.place), first = LEAGUES[c.lg].first;
    var pod = c.top.slice(0, 3).map(function (t, i) {
      var face = t[0] < 0 ? '<span class="avatar lg sea-meav">' + E((typeof S !== 'undefined' && S.jersey) || '7') + '</span>' : (typeof avatarHTML === 'function' ? avatarHTML(opp(t[0]), 'lg') : opp(t[0]).emoji);
      return '<div class="sea-pod p' + (i + 1) + (t[0] < 0 ? ' me' : '') + '">' + face + '<b>' + (t[0] < 0 ? E((typeof S !== 'undefined' && S.name) || 'You') : E(opp(t[0]).name)) + '</b><div class="sea-step">' + (i + 1) + '</div></div>';
    });
    var podium = pod.length === 3 ? pod[1] + pod[0] + pod[2] : pod.join('');
    snd('fanfare'); if (typeof FX !== 'undefined' && FX.confetti) try { FX.confetti(c.place <= 3 ? 140 : 70); } catch (e) {}
    modal('<h2 class="hero">' + rw.title + '</h2><div class="sea-cer">' +
      '<p style="text-align:center;margin:4px 0 10px">' + LEAGUES[c.lg].name + ', season ' + c.n + ': you finished <b>' + ord(c.place) + '</b> with ' + c.pts + ' points.</p>' +
      '<div class="sea-podium">' + podium + '</div>' +
      '<div class="row" style="margin:10px 0">' + pennantSVG(rw.kind, ord(c.place), 120) + '<div class="bubble">' + rw.line + ' Your pennant is in the trophy cabinet, and you earned <b>' + c.xp + ' XP</b>.</div></div>' +
      '<p style="text-align:center">Season ' + (c.n + 1) + ' starts now. Everyone begins on 0 points again!</p>' +
      '<div class="row"><button class="btn green" data-act="seasonCeremonyDone">Let\'s go!</button></div></div>', function () { var s2 = state(); s2.cer = null; save(); if (typeof current !== 'undefined' && current === 'season') render(tab); restore(prev); });
    void first;
  }
  if (typeof ACT !== 'undefined') {
    ACT.season = function (el) { open(el && el.dataset && el.dataset.arg); };
    ACT.seasonPeek = function (el) { snd('click'); peek(el && el.dataset && el.dataset.arg); };
    ACT.seasonTab = function (el) { snd('click'); render(el.dataset.arg); };
    ACT.seasonCeremony = function () { ceremony(); };
    ACT.seasonCeremonyDone = function () { if (typeof closeModal === 'function') closeModal(); };
    ACT.seasonBack = function () { if (backTo === 'trophies' && typeof ACT.trophies === 'function') ACT.trophies(); else if (typeof gotoTitle === 'function') gotoTitle(); };
  }
  return {
    onMatch: onMatch, lineHTML: lineHTML, open: open, render: render, buttonHTML: buttonHTML, pennants: pennants, pennantSVG: pennantSVG,
    state: state, table: function (lg) { return table(state()[lg || 'c']); }, LEAGUES: LEAGUES, GAMES_EACH: GAMES_EACH, MY_GAMES: MY_GAMES, ids: ids, lgOf: lgOf,
    _core: { newLeague: newLeague, fixtures: fixtures, simMatch: simMatch, play: play, table: table, placeOf: placeOf, normalize: normalize, blank: blank, pts: pts, rewardFor: rewardFor, strength: strength, hash: hash, REWARDS: REWARDS }
  };
})();
