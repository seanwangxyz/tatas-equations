'use strict';
// ======================= ACCOUNTS AND CLOUD SAVE =======================
// Sign in (Google, or email + password) so the save follows the kid from device to device (docs/handoff/account.md).
//   - Signed in: the save also lives at users/<uid>/save in the Firebase Realtime Database as
//     { v: 1, data: '<JSON of S>', rev, updatedAt (server time), device: 'iPad', did: '<device id>' }.
//     rev goes up by exactly 1 on every write (the security rules enforce it), so two devices can never overwrite
//     each other by accident: a write based on an old copy is refused, and this file merges instead.
//   - Signed out: nothing changes, the game saves on this device as always.
//   - Nothing is ever lost: whatever a sync replaces on this device is first copied into a local backup
//     (localStorage 'tatasEquations.backup.<time>', the last 3 are kept; Settings -> Account -> Restore a backup).
// Public API (all safe to call when accounts are switched off):
//   Account.chipHTML()     small title-screen chip ("Sign in to save" / name + cloud state). '' when switched off.
//   Account.panelHTML()    the Account group for the Settings screen. '' when switched off.
//   Account.authReady()    Promise: a signed-in user has been restored (used by online-net.js before anonymous sign-in)
//   Account.idle()         true when a cloud copy may be applied now (on a menu, no match, no pop-up)
//   Account.status()       'off' | 'out' | 'synced' | 'saving' | 'offline' | 'choose' | 'error'
//   Account.syncNow()      push now (and pick up anything newer)
//   Account.drop(on)       testing (?accounttest=1): pretend the Wi-Fi went off / came back
//   AccountMerge.*         the pure merge rules (tests/account.test.js)
// Tap handlers added: ACT.acctOpen, acctGoogle, acctEmailMode (sign in / create / forgot password), acctSignOut, acctSignOutGo,
//   acctSyncNow, acctBackups, acctRestore, acctDeleteAsk, acctDeleteGo, acctChoose, acctClose.
// Testing without Firebase: ?accounttest=1&dev=a and ?accounttest=1&dev=b in two tabs = two pretend devices with their
//   own saves and the same pretend cloud (localStorage 'tataAcct:*'). &popup=blocked pretends the Google pop-up is
//   blocked (the full-page fallback runs), &noprov=google (or email) pretends that method is not switched on yet.

/*MERGE-START*/
var AccountMerge = (function () {
  var HISTORY_CAP = 600, GIFT_MADE_CAP = 30, GIFT_SOLVED_CAP = 200, SEASON_HIST_CAP = 40, FAN_AT_CAP = 4;
  var MEDAL = { '': 0, bronze: 1, silver: 2, gold: 3 };
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : (+x || 0); }
  function max(a, b) { return Math.max(num(a), num(b)); }
  function has(x) { return x !== undefined; }
  // ---- building blocks. Each gets (a, b, ctx) where ctx.newer is 'a' or 'b' (the side played most recently) ----
  function pickNewer(a, b, c) { var n = c.newer === 'a' ? a : b, o = c.newer === 'a' ? b : a; return clone(has(n) ? n : o); }
  // settings objects: every key from both, the newer side wins where both have it
  function deepNewer(a, b, c) {
    var n = c.newer === 'a' ? a : b, o = c.newer === 'a' ? b : a;
    if (!isObj(n) || !isObj(o)) return clone(has(n) && n !== null ? n : o);
    var out = clone(o); Object.keys(n).forEach(function (k) { out[k] = isObj(n[k]) && isObj(o[k]) ? deepNewer(n[k], o[k], { newer: 'a' }) : clone(n[k]); });
    return out;
  }
  function maxNum(a, b) { return max(a, b); }
  function or(a, b) { return !!a || !!b; }
  function maxStr(a, b) { a = a || ''; b = b || ''; return a > b ? a : b; }
  function eachKey(a, b, fn) {
    var out = {}, ka = isObj(a) ? a : {}, kb = isObj(b) ? b : {};
    Object.keys(ka).concat(Object.keys(kb)).forEach(function (k) { if (!(k in out)) out[k] = fn(ka[k], kb[k], k); });
    return out;
  }
  function maxEach(a, b) { return eachKey(a, b, function (x, y) { return max(x, y); }); }
  function unionTrue(a, b) { return eachKey(a, b, function (x, y) { return clone(x || y); }); }
  // { id: 'YYYY-MM-DD' } (badges, cards): union, keep the EARLIEST date it was earned
  function unionEarliest(a, b) { return eachKey(a, b, function (x, y) { if (!x) return clone(y); if (!y) return clone(x); return (typeof x === 'string' && typeof y === 'string') ? (x < y ? x : y) : clone(x); }); }
  function minBase(a, b) { var ok = function (v) { return typeof v === 'number' && isFinite(v); }; return ok(a) && ok(b) ? Math.min(a, b) : ok(a) ? a : ok(b) ? b : null; }
  function newerOf(a, b, c) { return c.newer === 'a' ? a : b; }
  function olderOf(a, b, c) { return c.newer === 'a' ? b : a; }
  // anything we do not know (a feature added later): objects merge key by key with the same rule, else the newer wins
  function generic(a, b, c) {
    if (!has(a)) return clone(b); if (!has(b)) return clone(a);
    if (isObj(a) && isObj(b)) return eachKey(a, b, function (x, y) { return generic(x, y, c); });
    return pickNewer(a, b, c);
  }

  // counters and per-day buckets (the parent page): objects merge key by key, numbers keep the highest, anything else the newer
  function deepMax(a, b, c) {
    if (!has(a)) return clone(b); if (!has(b)) return clone(a);
    if (isObj(a) && isObj(b)) return eachKey(a, b, function (x, y) { return deepMax(x, y, c); });
    if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
    return pickNewer(a, b, c);
  }
  var STAT_LATEST = { streak: 1, noHint: 1, lastWrong: 1 }; // "right now" values, not totals
  var RULES = {
    v: maxNum,
    name: pickNewer, backName: pickNewer, jersey: pickNewer, oppNames: pickNewer, lastDedication: maxStr,
    xp: maxNum,
    badges: unionEarliest,
    stats: function (a, b, c) { return eachKey(a, b, function (x, y, k) { return STAT_LATEST[k] ? pickNewer(x, y, c) : (typeof x === 'boolean' || typeof y === 'boolean') ? pickNewer(x, y, c) : max(x, y); }); },
    history: function (a, b) {
      var seen = {}, all = [];
      (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []).forEach(function (h) {
        if (!h || typeof h !== 'object') return; var key = h.t + '|' + h.ms + '|' + h.g + '|' + h.ok;
        if (!seen[key]) { seen[key] = 1; all.push(clone(h)); }
      });
      all.sort(function (x, y) { if (num(x.t) !== num(y.t)) return num(x.t) - num(y.t); var p = JSON.stringify(x), r = JSON.stringify(y); return p < r ? -1 : p > r ? 1 : 0; });
      return all.slice(-HISTORY_CAP);
    },
    best: function (a, b) {
      a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
      var out = eachKey(a, b, function (x, y) { return clone(has(x) && x !== null ? x : y); });
      var fa = num(a.fastMs), fb = num(b.fastMs); out.fastMs = fa > 0 && fb > 0 ? Math.min(fa, fb) : (fa || fb || 0);
      var ha = a.hardGoal, hb = b.hardGoal;
      if (typeof ha === 'number' || typeof hb === 'number') {
        var useA = typeof ha === 'number' && (typeof hb !== 'number' || ha >= hb);
        out.hardGoal = useA ? ha : hb; out.hardGoalText = (useA ? a.hardGoalText : b.hardGoalText) || '';
      } else { out.hardGoal = null; out.hardGoalText = a.hardGoalText || b.hardGoalText || ''; }
      out.mostCubes = max(a.mostCubes, b.mostCubes);
      return out;
    },
    opsUsed: maxEach,
    ladder: function (a, b) {
      a = isObj(a) ? a : { stage: 1, stars: 0 }; b = isObj(b) ? b : { stage: 1, stars: 0 };
      var aw = num(a.stage) > num(b.stage) || (num(a.stage) === num(b.stage) && num(a.stars) >= num(b.stars));
      return clone(aw ? a : b);
    },
    unlockAll: pickNewer, opsManual: pickNewer, // Tata's parent-corner switches: the latest choice
    beaten: function (a, b) { a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : []; var out = []; for (var i = 0; i < Math.max(a.length, b.length); i++) out.push(!!a[i] || !!b[i]); return out; },
    cos: deepNewer, set: deepNewer, kit: deepNewer, kits: deepNewer, kitUse: pickNewer, team: deepNewer,
    cups: function (a, b, c) {
      a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
      var seen = {}, list = [];
      (Array.isArray(a.list) ? a.list : []).concat(Array.isArray(b.list) ? b.list : []).forEach(function (x) { var k = JSON.stringify(x); if (!seen[k]) { seen[k] = 1; list.push(clone(x)); } });
      list.sort(function (x, y) { return String(x && x.date || '') < String(y && y.date || '') ? -1 : 1; });
      var run = pickNewer(a.run, b.run, c);
      return { run: run === undefined ? null : run, won: maxEach(a.won, b.won), list: list };
    },
    ways: function (a, b, c) {
      a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
      var lead = num(a.done) > num(b.done) ? a : num(b.done) > num(a.done) ? b : newerOf(a, b, c);
      var best = eachKey(a.best, b.best, function (x, y) { return (MEDAL[x || ''] || 0) >= (MEDAL[y || ''] || 0) ? clone(x) : clone(y); });
      var out = generic(olderOf(a, b, c), newerOf(a, b, c), { newer: 'b' });
      out.lvl = num(lead.lvl) || 1; out.row = num(lead.row); out.miss = num(lead.miss);
      out.done = max(a.done, b.done); out.total = max(a.total, b.total); out.best = best;
      return out;
    },
    gift: function (a, b) {
      a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
      var seen = {}, made = [];
      (Array.isArray(a.made) ? a.made : []).concat(Array.isArray(b.made) ? b.made : []).forEach(function (m) { if (m && !seen[m.code]) { seen[m.code] = 1; made.push(clone(m)); } });
      made.sort(function (x, y) { return num(y.t) - num(x.t); });
      var solved = eachKey(a.solved, b.solved, function (x, y) { if (!x) return clone(y); if (!y) return clone(x); return clone(num(x.t) <= num(y.t) ? x : y); });
      var keys = Object.keys(solved);
      if (keys.length > GIFT_SOLVED_CAP) { keys.sort(function (p, q) { return num(solved[p].t) - num(solved[q].t); }); keys.slice(0, keys.length - GIFT_SOLVED_CAP).forEach(function (k) { delete solved[k]; }); }
      return { made: made.slice(0, GIFT_MADE_CAP), solved: solved };
    },
    tips: function (a, b, c) { a = isObj(a) ? a : {}; b = isObj(b) ? b : {}; var last = pickNewer(a.last, b.last, c); return { seen: max(a.seen, b.seen), kinds: maxEach(a.kinds, b.kinds), last: Array.isArray(last) ? last : [] }; },
    trios: unionTrue,
    vari: function (a, b) { a = isObj(a) ? a : {}; b = isObj(b) ? b : {}; return { base: minBase(a.base, b.base), seen: max(a.seen, b.seen) }; },
    bonus: function (a, b, c) {
      a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
      return { base: minBase(a.base, b.base), seen: unionTrue(a.seen, b.seen), opsSeen: unionTrue(a.opsSeen, b.opsSeen),
        force: pickNewer(a.force, b.force, c) || {}, off: pickNewer(a.off, b.off, c) || {}, opOff: pickNewer(a.opOff, b.opOff, c) || {} };
    },
    teamWins: maxEach,
    tutorialDone: or,
    dailyDone: unionTrue,
    camp: function (a, b, c) {
      return eachKey(a, b, function (x, y, k) {
        if (!isObj(x) || !isObj(y)) return k === 'quizRow' ? pickNewer(x, y, c) : generic(x, y, c);
        var lead = num(x.done) > num(y.done) ? x : num(y.done) > num(x.done) ? y : newerOf(x, y, c);
        var out = generic(x, y, c); ['lvl', 'row', 'miss'].forEach(function (f) { if (has(lead[f])) out[f] = lead[f]; }); out.done = max(x.done, y.done);
        return out;
      });
    },
    wx: function (a, b, c) { a = isObj(a) ? a : {}; b = isObj(b) ? b : {}; var out = generic(a, b, c); out.n = max(a.n, b.n); return out; },
    puz: function (a, b, c) {
      if (!isObj(a) || !isObj(b)) return clone(isObj(a) ? a : b);
      if (a.date !== b.date) return clone(String(a.date) > String(b.date) ? a : b);
      var out = generic(a, b, c); out.cur = max(a.cur, b.cur); out.extra = max(a.extra, b.extra); return out;
    },
    cards: unionEarliest,
    stadiumTierSeen: maxNum,
    season: function (a, b, c) {
      if (!isObj(a) || !isObj(b)) return clone(isObj(a) ? a : b);
      var out = generic(a, b, c);
      ['c', 'm'].forEach(function (lg) {
        var x = a[lg], y = b[lg];
        if (!isObj(x) || !isObj(y)) { out[lg] = clone(isObj(x) ? x : y); return; }
        var ka = [num(x.n), num(x.k), num(x.sim)], kb = [num(y.n), num(y.k), num(y.sim)];
        var aw = ka[0] !== kb[0] ? ka[0] > kb[0] : ka[1] !== kb[1] ? ka[1] > kb[1] : ka[2] !== kb[2] ? ka[2] > kb[2] : c.newer === 'a';
        out[lg] = clone(aw ? x : y);
      });
      var seen = {}, hist = [];
      (Array.isArray(a.hist) ? a.hist : []).concat(Array.isArray(b.hist) ? b.hist : []).forEach(function (h) { if (!h) return; var k = h.lg + '|' + h.n; if (!seen[k]) { seen[k] = 1; hist.push(clone(h)); } });
      hist.sort(function (x, y) { return String(x.date) < String(y.date) ? -1 : String(x.date) > String(y.date) ? 1 : num(x.n) - num(y.n); });
      out.hist = hist.slice(-SEASON_HIST_CAP);
      out.won = maxEach(a.won, b.won);
      var ca = a.cer, cb = b.cer; out.cer = ca && cb ? clone(num(ca.n) >= num(cb.n) ? ca : cb) : clone(ca || cb || null);
      out.last = pickNewer(a.last, b.last, c) || 'c';
      return out;
    },
    onsets: function (a, b, c) {
      if (!isObj(a) || !isObj(b)) return clone(isObj(a) ? a : b);
      var out = deepMax(a, b, c), seen = {}, be = [];
      (Array.isArray(a.beaten) ? a.beaten : []).concat(Array.isArray(b.beaten) ? b.beaten : []).forEach(function (x, i) { if (x === true || x === false || x == null) return; if (!seen[x]) { seen[x] = 1; be.push(x); } });
      if (Array.isArray(a.beaten) && Array.isArray(b.beaten) && a.beaten.concat(b.beaten).every(function (x) { return x === true || x === false || x == null; })) { be = []; for (var i = 0; i < Math.max(a.beaten.length, b.beaten.length); i++) be[i] = !!a.beaten[i] || !!b.beaten[i]; }
      out.beaten = be; out.tutorialDone = !!a.tutorialDone || !!b.tutorialDone;
      return out;
    },
    tour: function (a, b) { a = isObj(a) ? a : {}; b = isObj(b) ? b : {}; return { v: max(a.v, b.v) || 0, seen: unionTrue(a.seen, b.seen), opened: unionTrue(a.opened, b.opened) }; },
    parent: function (a, b, c) { return deepMax(a, b, c); },
    matchday: function (a, b, c) { return pickNewer(a, b, c); }, // MATCHDAY: toss seed, counter, a pending toss
    tourney: function (a, b, c) { // TOURNEY: counters highest, options newest, round log union by time (20 newest)
      if (!has(a)) return clone(b); if (!has(b)) return clone(a);
      var out = eachKey(a, b, function (x, y, k) { return k === 'opt' ? pickNewer(x, y, c) : k === 'log' ? null : max(x, y); });
      var seen = {}, log = [];
      (Array.isArray(a.log) ? a.log : []).concat(Array.isArray(b.log) ? b.log : []).forEach(function (r) { if (r && !seen[r.t]) { seen[r.t] = 1; log.push(clone(r)); } });
      out.log = log.sort(function (x, y) { return num(x.t) - num(y.t); }).slice(-20);
      return out;
    },
    /*RIVALS-MERGE-START*/
    rivals: function rivalsMerge(a, b) {
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
  },
    /*RIVALS-MERGE-END*/
    fans: function (a, b) {
      a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
      var k = eachKey(a.k, b.k, function (x, y) {
        if (!isObj(x)) return clone(y); if (!isObj(y)) return clone(x);
        var at = []; (Array.isArray(x.at) ? x.at : []).concat(Array.isArray(y.at) ? y.at : []).forEach(function (v) { if (at.indexOf(v) < 0) at.push(v); });
        return { d: String(x.d || '') && String(y.d || '') ? (String(x.d) < String(y.d) ? x.d : y.d) : (x.d || y.d), at: at.slice(0, FAN_AT_CAP) };
      });
      return { v: max(a.v, b.v) || 1, k: k };
    }
  };
  // How each key is merged, in plain words (also printed in docs/handoff/account.md).
  var DESCRIBE = {
    v: 'highest', name: 'latest', backName: 'latest', jersey: 'latest', oppNames: 'latest', lastDedication: 'latest date',
    xp: 'highest', badges: 'union (earliest date)', stats: 'each total: highest; streak/noHint/lastWrong: latest',
    history: 'union of both, oldest dropped past 600', best: 'fastest time, hardest Goal, most cubes', opsUsed: 'highest per operation',
    ladder: 'highest stage, then stars', unlockAll: 'latest', opsManual: 'latest', beaten: 'beaten on either',
    cos: 'latest (keys from both)', set: 'latest (keys from both)', kit: 'latest', kits: 'latest', kitUse: 'latest', team: 'latest',
    cups: 'wins: highest per cup; list: union; run in progress: latest', ways: 'medals: best per level; totals: highest; level: the side that played more',
    gift: 'made: union (30 newest); solved: union (200)', tips: 'counts: highest; last: latest', trios: 'union', vari: 'earliest start (more cards), highest seen',
    bonus: 'dice seen: union; earliest start; Tata\'s switches: latest', teamWins: 'highest per creature', tutorialDone: 'done on either', dailyDone: 'union',
    camp: 'per drill: the side that played more; done: highest', wx: 'count: highest; current sky: latest', puz: 'same day: furthest; else the later day',
    cards: 'union (earliest date)', stadiumTierSeen: 'highest', season: 'each league: the one further along; finished seasons: union; pennants: highest',
    fans: 'union (earliest date, places from both)',
    onsets: 'On-Sets: stars and totals highest; creatures beaten on either',
    matchday: 'the coin-toss seed: the newer device',
    tourney: 'tournament practice: rounds and wins highest; options newest; rounds log union',
    rivals: 'per creature: the side with more matches; milestones: union (earliest); best streak, biggest Goal, admired Solution: best of both',
    tour: 'tour stops seen on either device', parent: 'each counter and each day: highest'
  };

  function newerSide(o) { o = o || {}; return num(o.bAt) > num(o.aAt) ? 'b' : 'a'; }
  // Combine two saves (a = this device, b = the cloud). Never loses progress.
  function combine(a, b, o) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    var ctx = { newer: newerSide(o) }, out = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) {
      if (k in out) return;
      var f = RULES[k] || generic, v = f(a[k], b[k], ctx);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  function count(o) { return isObj(o) ? Object.keys(o).filter(function (k) { return o[k]; }).length : 0; }
  function levelFor(xp) { var L = 1; while (xp >= 50 * L * (L + 1)) L++; return L; }
  function lastPlayed(s) { var h = s && Array.isArray(s.history) ? s.history : [], t = 0; h.forEach(function (x) { if (x && num(x.t) > t) t = num(x.t); }); return t; }
  function summary(s) {
    s = isObj(s) ? s : {};
    return { name: s.name || '', xp: num(s.xp), level: levelFor(num(s.xp)), beaten: (Array.isArray(s.beaten) ? s.beaten : []).filter(Boolean).length,
      creatures: Array.isArray(s.beaten) ? s.beaten.length : 0, badges: count(s.badges), correct: num(s.stats && s.stats.correct), last: lastPlayed(s) };
  }
  // A save with no real progress yet (a new device): safe to replace without asking.
  function isFresh(s) {
    s = isObj(s) ? s : {};
    return !num(s.xp) && !count(s.badges) && !(Array.isArray(s.history) && s.history.length) && !(Array.isArray(s.beaten) && s.beaten.some(Boolean)) && !num(s.stats && s.stats.correct) && !num(s.stats && s.stats.shakes);
  }
  function stable(x) { if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']'; if (isObj(x)) return '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(x[k]); }).join(',') + '}'; return JSON.stringify(x === undefined ? null : x); }
  function same(a, b) { return stable(a) === stable(b); }
  return { combine: combine, summary: summary, isFresh: isFresh, same: same, levelFor: levelFor, lastPlayed: lastPlayed, RULES: RULES, DESCRIBE: DESCRIBE, HISTORY_CAP: HISTORY_CAP };
})();
/*MERGE-END*/

var Account = (function () {
  var OFF = { chipHTML: function () { return ''; }, panelHTML: function () { return ''; }, authReady: function () { return Promise.resolve(); }, idle: function () { return true; }, status: function () { return 'off'; }, syncNow: function () {}, drop: function () {} };
  if (typeof window === 'undefined' || typeof document === 'undefined') return OFF;
  var q = location.search;
  var TEST = /[?&]accounttest=1(&|$)/.test(q);
  var DEV = (q.match(/[?&]dev=([a-z0-9]{1,8})(&|$)/) || [])[1] || 'a';
  var CFG = window.ACCOUNT_CONFIG || { google: true, email: false };
  var PROV = TEST ? { google: true, email: true } : { google: !!CFG.google, email: !!CFG.email };
  var FIRE = !TEST && !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.databaseURL);
  if (!(TEST || FIRE) || !(PROV.google || PROV.email)) return OFF;

  // Test mode: each pretend device has its own save on this computer.
  if (TEST && typeof SAVE_KEY !== 'undefined') {
    SAVE_KEY = 'tatasEquations.v1.acct.' + DEV;
    S = merge(defaults(), loadSave()); normalizeSave(); if (typeof applyOppNames === 'function') applyOppNames();
  }
  var META_KEY = SAVE_KEY + '.account', DID_KEY = SAVE_KEY + '.did';
  var BK_PFX = 'tatasEquations.backup.' + (TEST ? 'test-' + DEV + '.' : ''), BK_KEEP = 3;
  var PUSH_DELAY = 3000;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function jget(k) { try { return JSON.parse(lsGet(k)); } catch (e) { return null; } }
  var DID = lsGet(DID_KEY); if (!DID) { DID = Math.random().toString(36).slice(2, 12); lsSet(DID_KEY, DID); }
  function deviceLabel() {
    if (TEST) return 'Test device ' + DEV.toUpperCase();
    var u = navigator.userAgent || '';
    if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone/.test(u)) return 'iPhone'; if (/Android/.test(u)) return 'Android'; if (/CrOS/.test(u)) return 'Chromebook';
    if (/Macintosh/.test(u)) return 'Mac'; if (/Windows/.test(u)) return 'Windows PC'; return 'Computer';
  }
  var DEVICE = deviceLabel();
  // meta: which account this device's save belongs to and which cloud revision it is based on
  var meta = jget(META_KEY) || {};
  function saveMeta() { lsSet(META_KEY, JSON.stringify(meta)); }

  // ======================================================== back end: pretend (test) ========================================================
  function Fake() {
    var dropped = false, held = [], watchers = [], connCbs = [], userCbs = [], cur = null;
    var USERS = 'tataAcct:users', SESS = 'tataAcct:session.' + DEV, DB = 'tataAcct:db:';
    var noprov = (q.match(/[?&]noprov=([a-z]+)/) || [])[1] || '';
    function err(code) { var e = new Error(code); e.code = code; return e; }
    function later(fn) { return new Promise(function (ok, bad) { setTimeout(function () { if (dropped) bad(err('auth/network-request-failed')); else { try { ok(fn()); } catch (e) { bad(e); } } }, 120); }); }
    function users() { return jget(USERS) || {}; }
    function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return 'h' + h.toString(36); } // pretend accounts only
    function setUser(u) { cur = u; if (u) lsSet(SESS, u.uid); else lsDel(SESS); userCbs.forEach(function (cb) { cb(u); }); return u; }
    function find(uid) { var all = users(); for (var k in all) if (all[k].uid === uid) return pub(all[k]); return null; }
    function pub(r) { return { uid: r.uid, email: r.email, name: r.name || '', provider: r.provider }; }
    function readDoc(uid) { return jget(DB + uid); }
    function fire(uid) { watchers.forEach(function (w) { if (w.uid === uid && w.live) w.cb(readDoc(uid)); }); }
    window.addEventListener('storage', function (e) { if (dropped || !e.key || e.key.indexOf(DB) !== 0) return; fire(e.key.slice(DB.length)); });
    function google() {
      var all = users(), k = 'parent.google@example.test';
      if (!all[k]) { all[k] = { uid: 'G' + Math.random().toString(36).slice(2, 10), email: k, name: 'Test Parent', provider: 'google' }; lsSet(USERS, JSON.stringify(all)); }
      return setUser(pub(all[k]));
    }
    var redirectPending = false;
    try { redirectPending = sessionStorage.getItem('tataAcct:redirect.' + DEV) === '1'; sessionStorage.removeItem('tataAcct:redirect.' + DEV); } catch (e) {}
    return {
      kind: 'fake',
      load: function () { return Promise.resolve(); },
      ready: true,
      onUser: function (cb) {
        userCbs.push(cb);
        var uid = lsGet(SESS); cur = uid ? find(uid) : null;
        setTimeout(function () { cb(cur); }, 0);
      },
      redirectResult: function () { if (!redirectPending) return Promise.resolve(null); redirectPending = false; return later(google); },
      google: function () {
        if (noprov === 'google') return Promise.reject(err('auth/operation-not-allowed'));
        if (/[?&]popup=blocked/.test(q)) { // the pop-up is blocked: go the full-page way (here: a reload that comes back signed in)
          try { sessionStorage.setItem('tataAcct:redirect.' + DEV, '1'); } catch (e) {}
          setTimeout(function () { location.reload(); }, 300);
          return new Promise(function () {});
        }
        return later(google);
      },
      emailCreate: function (email, pw) {
        if (noprov === 'email') return Promise.reject(err('auth/operation-not-allowed'));
        return later(function () {
          email = String(email || '').trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('auth/invalid-email');
          if (String(pw || '').length < 6) throw err('auth/weak-password');
          var all = users(); if (all[email]) throw err('auth/email-already-in-use');
          all[email] = { uid: 'E' + Math.random().toString(36).slice(2, 10), email: email, pw: hash(pw), name: '', provider: 'password' };
          lsSet(USERS, JSON.stringify(all)); return setUser(pub(all[email]));
        });
      },
      emailSignIn: function (email, pw) {
        if (noprov === 'email') return Promise.reject(err('auth/operation-not-allowed'));
        return later(function () {
          email = String(email || '').trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('auth/invalid-email');
          var r = users()[email]; if (!r || r.provider !== 'password') throw err('auth/user-not-found');
          if (r.pw !== hash(pw)) throw err('auth/wrong-password');
          return setUser(pub(r));
        });
      },
      reset: function (email) { return later(function () { email = String(email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('auth/invalid-email'); return true; }); },
      signOut: function () { setUser(null); return Promise.resolve(); },
      get: function (uid) { return later(function () { return readDoc(uid); }); },
      put: function (uid, doc) {
        var run = function () {
          var now = readDoc(uid), want = now ? now.rev + 1 : 1;
          if (doc.rev !== want) throw err('PERMISSION_DENIED');
          var d = JSON.parse(JSON.stringify(doc)); d.updatedAt = Date.now();
          lsSet(DB + uid, JSON.stringify(d)); fire(uid); return true;
        };
        if (dropped) return new Promise(function (ok, bad) { held.push(function () { try { ok(run()); } catch (e) { bad(e); } }); }); // waits like Firebase does offline
        return new Promise(function (ok, bad) { setTimeout(function () { try { ok(run()); } catch (e) { bad(e); } }, 120); });
      },
      remove: function (uid) { return later(function () { lsDel(DB + uid); fire(uid); return true; }); },
      watch: function (uid, cb) { var w = { uid: uid, cb: cb, live: true }; watchers.push(w); setTimeout(function () { if (w.live && !dropped) cb(readDoc(uid)); }, 0); return function () { w.live = false; }; },
      onConnected: function (cb) { connCbs.push(cb); setTimeout(function () { cb(!dropped); }, 0); },
      drop: function (on) {
        dropped = !!on; connCbs.forEach(function (cb) { cb(!dropped); });
        if (!dropped) { var h = held; held = []; h.forEach(function (f) { f(); }); watchers.forEach(function (w) { if (w.live) w.cb(readDoc(w.uid)); }); }
        return dropped;
      }
    };
  }

  // ======================================================== back end: Firebase ========================================================
  function Fire() {
    var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/'; // same pinned version as js/online-net.js
    var loading = null, auth = null, db = null, api;
    function load(src) {
      return new Promise(function (ok, bad) {
        var s = document.createElement('script'); s.src = SDK + src; s.async = false;
        s.onload = function () { ok(); }; s.onerror = function () { var e = new Error('sdk'); e.code = 'auth/network-request-failed'; bad(e); };
        document.head.appendChild(s);
      });
    }
    function map(u) {
      if (!u || u.isAnonymous) return null; // an anonymous user (online play) is "not signed in" here
      var p = (u.providerData && u.providerData[0] && u.providerData[0].providerId) || 'password';
      return { uid: u.uid, email: u.email || '', name: u.displayName || '', provider: p === 'google.com' ? 'google' : 'password' };
    }
    function ref(uid) { return db.ref('users/' + uid + '/save'); }
    // an anonymous online-play user is upgraded in place (same uid); if the Google account already exists, sign in to it
    function adopt(e) {
      if (e && (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') && e.credential) return auth.signInWithCredential(e.credential);
      throw e;
    }
    function fresh(cred) { var u = cred && cred.user; return u ? u.getIdToken(true).then(function () { return map(u); }) : map(auth.currentUser); }
    function standalone() { return navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }
    api = {
      kind: 'firebase', ready: false,
      load: function () {
        if (loading) return loading;
        loading = (window.firebase && firebase.auth && firebase.database ? Promise.resolve() :
          (window.firebase ? Promise.resolve() : load('firebase-app-compat.js')).then(function () { return Promise.all([firebase.auth ? null : load('firebase-auth-compat.js'), firebase.database ? null : load('firebase-database-compat.js')]); }))
          .then(function () {
            if (!firebase.apps.length) {
              var c = {}; Object.keys(window.FIREBASE_CONFIG).forEach(function (k) { c[k] = window.FIREBASE_CONFIG[k]; });
              if (CFG.authDomain) c.authDomain = CFG.authDomain; // e.g. 'profsean.wang' once the sign-in helper is hosted there (docs)
              firebase.initializeApp(c);
            }
            auth = firebase.auth(); db = firebase.database(); api.ready = true;
          })
          .catch(function (e) { loading = null; throw e; });
        return loading;
      },
      onUser: function (cb) { auth.onAuthStateChanged(function (u) { cb(map(u)); }); },
      redirectResult: function () {
        return auth.getRedirectResult().then(function (r) { return r && r.user ? fresh(r) : null; }, function (e) { return Promise.resolve(adopt(e)).then(fresh); });
      },
      // Called straight from the tap (the SDK is already loaded), so Safari counts the pop-up as wanted.
      google: function () {
        var p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
        var u = auth.currentUser, anon = u && u.isAnonymous;
        function redirect() { try { sessionStorage.setItem('tataAcct:redirect', '1'); } catch (e) {} return (anon ? u.linkWithRedirect(p) : auth.signInWithRedirect(p)).then(function () { return new Promise(function () {}); }); }
        if (standalone()) return redirect(); // a home-screen app on iPad/iPhone cannot get a pop-up back
        return (anon ? u.linkWithPopup(p) : auth.signInWithPopup(p)).catch(adopt).then(fresh, function (e) {
          if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return redirect();
          throw e;
        });
      },
      emailCreate: function (email, pw) {
        var u = auth.currentUser;
        if (u && u.isAnonymous) return u.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email, pw)).then(fresh);
        return auth.createUserWithEmailAndPassword(email, pw).then(fresh);
      },
      emailSignIn: function (email, pw) { return auth.signInWithEmailAndPassword(email, pw).then(fresh); },
      reset: function (email) { return auth.sendPasswordResetEmail(email); },
      signOut: function () { return auth.signOut(); },
      get: function (uid) { return ref(uid).once('value').then(function (s) { return s.val(); }); },
      put: function (uid, doc) {
        var d = { v: doc.v, data: doc.data, rev: doc.rev, device: doc.device, did: doc.did, updatedAt: firebase.database.ServerValue.TIMESTAMP };
        return ref(uid).set(d);
      },
      remove: function (uid) { return ref(uid).remove(); },
      watch: function (uid, cb) { var r = ref(uid), h = r.on('value', function (s) { cb(s.val()); }, function () {}); return function () { r.off('value', h); }; },
      onConnected: function (cb) { db.ref('.info/connected').on('value', function (s) { cb(s.val() === true); }); },
      drop: function (on) { if (on) db.goOffline(); else db.goOnline(); return !!on; }
    };
    return api;
  }

  var B = TEST ? Fake() : Fire();

  // ======================================================== sync engine ========================================================
  var user = null, started = null, authFirst = null, connected = true, inFlight = 0, pending = null, choice = null;
  var pushTimer = null, idleTimer = null, unwatch = null, lastError = '', busyMsg = '';
  var rawPersist = persist;
  // every save on this device also schedules a cloud save (wraps the global persist() from js/config.js)
  persist = function () { rawPersist(); onPersist(); };
  function onPersist() {
    meta.localAt = Date.now();
    if (!user || meta.uid !== user.uid) { saveMeta(); return; }
    meta.dirty = true; saveMeta(); schedule(); paint();
  }
  function schedule() { clearTimeout(pushTimer); pushTimer = setTimeout(push, PUSH_DELAY); }
  function localAt() { return meta.localAt || AccountMerge.lastPlayed(S); }

  function start() {
    if (started) return started;
    started = B.load().then(function () {
      authFirst = new Promise(function (ok) {
        var first = true;
        B.onUser(function (u) { onUser(u); if (first) { first = false; ok(); } });
      });
      B.onConnected(function (c) { var was = connected; connected = c; if (c && !was && user) { if (meta.dirty) push(); catchUp(); } paint(); });
      var flagged = false; try { flagged = sessionStorage.getItem('tataAcct:redirect') === '1'; sessionStorage.removeItem('tataAcct:redirect'); } catch (e) {}
      B.redirectResult().then(function (u) { if (u) { onUser(u); toast(CLOUD + ' Signed in. Hi!'); } else if (flagged) say('Sign-in did not come back', 'The Google page did not return to the game. Tap <b>Continue with Google</b> again. On an iPad, allowing pop-ups for this site helps (Settings, Safari, Block Pop-ups off).'); },
        function (e) { say('Sign-in did not work', kind(e)); });
      return authFirst;
    });
    started.catch(function () { started = null; });
    return started;
  }
  function authReady() { if (!FIRE) return Promise.resolve(); return start().catch(function () {}); }

  function onUser(u) {
    if (!u) {
      if (user) { stopWatch(); user = null; }
      paint(); return;
    }
    if (user && user.uid === u.uid) { user = u; paint(); return; }
    user = u; lastError = '';
    if (u.name || u.email) { meta.who = u.name || u.email; meta.email = u.email; }
    if (meta.uid === u.uid) resume(); else firstSync();
    paint();
  }
  function num0(x) { return +x || 0; }
  function parse(doc) { try { return JSON.parse(doc.data); } catch (e) { return null; } }
  function adoptSave(data) { S = merge(defaults(), data); normalizeSave(); rawPersist(); }
  function startWatch() { if (unwatch || !user) return; var uid = user.uid; unwatch = B.watch(uid, function (doc) { onRemote(uid, doc); }); }
  function stopWatch() { if (unwatch) { unwatch(); unwatch = null; } clearTimeout(pushTimer); pending = null; choice = null; }

  // signed in on this device before: carry on from where it was
  function resume() {
    var uid = user.uid;
    B.get(uid).then(function (cloud) {
      if (!user || user.uid !== uid) return;
      if (!cloud) { if (meta.rev > 0) { deletedElsewhere(); return; } meta.dirty = true; saveMeta(); push(); }
      else if (cloud.rev === meta.rev) { if (meta.dirty) push(); }
      else { if (cloud.rev < meta.rev) { meta.dirty = true; saveMeta(); } pending = cloud; tryApply(); }
      startWatch(); paint();
    }, function (e) { netFail(e); startWatch(); });
  }
  // first sign-in to this account on this device
  function firstSync() {
    var uid = user.uid;
    busyMsg = 'Checking the cloud…'; paint();
    B.get(uid).then(function (cloud) {
      busyMsg = '';
      if (!user || user.uid !== uid) return;
      var data = cloud && parse(cloud);
      if (!cloud || !data) { // nothing in the cloud yet: this device's progress goes up
        meta = { uid: uid, who: meta.who, email: meta.email, rev: cloud ? cloud.rev : 0, dirty: true, localAt: localAt() }; saveMeta();
        startWatch(); push(); paint(); return;
      }
      if (AccountMerge.isFresh(S) || AccountMerge.same(S, data)) { // a new device (or the same progress): just use the cloud copy
        if (!AccountMerge.same(S, data)) backup(S, 'This device before using the cloud save');
        meta = { uid: uid, who: meta.who, email: meta.email, rev: cloud.rev, dirty: false, localAt: cloud.updatedAt || Date.now(), syncedAt: Date.now() }; saveMeta();
        adoptSave(data); refreshUI(); startWatch(); paint();
        if (!AccountMerge.isFresh(data)) toast(CLOUD + ' Progress loaded from the cloud!');
        return;
      }
      choice = { uid: uid, cloud: cloud, data: data }; paint(); askChoice();
    }, function (e) { busyMsg = ''; netFail(e); setTimeout(function () { if (user && user.uid === uid && meta.uid !== uid) firstSync(); }, 8000); });
  }
  function choose(which) {
    var c = choice; if (!c || !user || user.uid !== c.uid) return;
    choice = null;
    meta = { uid: c.uid, who: meta.who, email: meta.email, rev: c.cloud.rev, dirty: false, localAt: localAt(), syncedAt: Date.now() };
    if (which === 'cloud') { backup(S, 'This device before using the cloud save'); adoptSave(c.data); meta.localAt = c.cloud.updatedAt || Date.now(); }
    else if (which === 'device') { backup(c.data, 'The cloud save before this device replaced it'); meta.dirty = true; }
    else { backup(S, 'This device before combining'); var m = AccountMerge.combine(S, c.data, { aAt: localAt(), bAt: c.cloud.updatedAt }); adoptSave(m); meta.dirty = true; }
    saveMeta(); refreshUI(); startWatch(); if (meta.dirty) push(); paint();
    toast(CLOUD + (which === 'cloud' ? ' Using the cloud save.' : which === 'device' ? ' Using this device\'s save.' : ' Combined! The best of both.'));
  }

  function push() {
    clearTimeout(pushTimer);
    if (!user || meta.uid !== user.uid || choice || inFlight || pending) { paint(); return; }
    if (!meta.dirty) { paint(); return; }
    var uid = user.uid, json = JSON.stringify(S), rev = (meta.rev || 0) + 1;
    // "Reset progress" while signed in: the reset goes to the cloud too (Tata asked for it), but the cloud copy it
    // replaces is first kept as a backup on this device.
    if (meta.rev > 0 && meta.guard !== meta.rev && AccountMerge.isFresh(S)) {
      inFlight = -1;
      B.get(uid).then(function (c) { var d = c && parse(c); if (d && !AccountMerge.isFresh(d)) backup(d, 'The cloud save before progress was reset'); meta.guard = meta.rev; inFlight = 0; push(); },
        function (e) { inFlight = 0; netFail(e); });
      return;
    }
    inFlight = rev; paint();
    B.put(uid, { v: 1, data: json, rev: rev, device: DEVICE, did: DID }).then(function () {
      inFlight = 0;
      if (!user || user.uid !== uid) return;
      meta.rev = rev; meta.syncedAt = Date.now(); lastError = '';
      if (JSON.stringify(S) === json) meta.dirty = false; else schedule();
      saveMeta(); paint();
    }, function (e) {
      inFlight = 0;
      if (!user || user.uid !== uid) return;
      if (isNet(e)) { netFail(e); return; }
      // refused: someone else wrote first (or the cloud copy was deleted). Look and merge.
      B.get(uid).then(function (cloud) {
        if (!cloud) { if (meta.rev > 0) { deletedElsewhere(); return; } lastError = kind(e); paint(); return; }
        if (cloud.rev !== meta.rev) { meta.dirty = true; saveMeta(); pending = cloud; tryApply(); }
        else { lastError = kind(e); paint(); }
      }, netFail);
    });
  }
  function catchUp() { if (!user || meta.uid !== user.uid) return; B.get(user.uid).then(function (c) { onRemote(user && user.uid, c); }, function () {}); }
  function onRemote(uid, doc) {
    if (!user || user.uid !== uid || meta.uid !== uid || choice) return;
    if (!doc) { if (meta.rev > 0 && !inFlight) deletedElsewhere(); return; }
    if (inFlight && doc.rev === inFlight && doc.did === DID) return; // our own write echoing back
    if (doc.rev <= (meta.rev || 0)) return;
    pending = doc; tryApply();
  }
  // a newer copy from another device: apply it only between matches
  function tryApply() {
    clearTimeout(idleTimer);
    if (!pending || !user) { paint(); return; }
    if (inFlight || !idle()) { idleTimer = setTimeout(tryApply, 1500); paint(); return; }
    var doc = pending; pending = null;
    var data = parse(doc); if (!data) { paint(); return; }
    if (meta.dirty) { // both changed: combine (lossless) and send the result back up
      adoptSave(AccountMerge.combine(S, data, { aAt: localAt(), bAt: doc.updatedAt }));
      meta.rev = doc.rev; saveMeta(); refreshUI(); push();
    } else {
      if (num0(data.xp) < num0(S.xp) || (AccountMerge.isFresh(data) && !AccountMerge.isFresh(S))) backup(S, 'This device before ' + (doc.device || 'another device') + '\'s save replaced it');
      adoptSave(data); meta.rev = doc.rev; meta.localAt = doc.updatedAt || Date.now(); meta.syncedAt = Date.now(); saveMeta(); refreshUI();
    }
    toast(CLOUD + ' Updated with progress from ' + esc(doc.device || 'another device') + '.');
    paint();
  }
  function deletedElsewhere() {
    var was = user; stopWatch();
    meta = { localAt: meta.localAt }; saveMeta();
    B.signOut().catch(function () {});
    if (was) say('Signed out', 'The cloud save was deleted on another device, so this device signed out too. Everything on this device is still here.');
    paint();
  }
  function netFail(e) { if (isNet(e)) { lastError = ''; if (TEST) connected = false; } else lastError = kind(e); paint(); }
  function isNet(e) { var c = (e && (e.code || e.message)) || ''; return /network|offline|unavailable|disconnect/i.test(c); }

  // ---- is it OK to swap the save right now? Only on a menu screen, with no match and no pop-up open ----
  var MENUS = { title: 1, settings: 1, trophies: 1, stats: 1, season: 1, cabinet: 1, fans: 1, setup: 1, splash: 1 };
  function idle() {
    try {
      if (typeof window.accountBusy === 'function' && window.accountBusy()) return false;
      if (typeof G !== 'undefined' && G) return false;
      if (typeof current !== 'undefined' && !MENUS[current]) return false;
      var m = document.getElementById('modal'), b = document.getElementById('builder');
      if (b && b.classList.contains('on')) return false;
      if (m && m.classList.contains('on') && !m.querySelector('[data-acct-modal]')) return false;
      return true;
    } catch (e) { return false; }
  }
  function refreshUI() {
    try { if (typeof applyOppNames === 'function') applyOppNames(); if (typeof applyCosmetics === 'function') applyCosmetics(); if (window.T3 && T3.playerRefresh) T3.playerRefresh(); } catch (e) {}
    try { if (current === 'title' && typeof gotoTitle === 'function') gotoTitle(); else if (current === 'settings' && typeof renderSettings === 'function') renderSettings(); } catch (e) {}
  }

  // ---- backups (this device only) ----
  function backups() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(BK_PFX) === 0 && /^\d+$/.test(k.slice(BK_PFX.length))) out.push(k); } } catch (e) {}
    return out.map(function (k) { var v = jget(k); return v && v.data ? { key: k, at: +k.slice(BK_PFX.length), why: v.why || '', data: v.data } : null; }).filter(Boolean).sort(function (a, b) { return b.at - a.at; });
  }
  function backup(data, why) {
    if (!data) return;
    var list = backups();
    if (list[0] && AccountMerge.same(list[0].data, data)) return;
    var at = Date.now(); while (lsGet(BK_PFX + at)) at++;
    lsSet(BK_PFX + at, JSON.stringify({ why: why, data: data }));
    backups().slice(BK_KEEP).forEach(function (b) { lsDel(b.key); });
  }

  // ======================================================== words and pictures ========================================================
  var CLOUD = '<svg class="acct-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z" fill="currentColor"/></svg>';
  var GLOGO = '<svg class="acct-g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
  var STATE = {
    out: ['Sign in to save', ''], synced: ['Saved', '✔'], saving: ['Saving…', '⟳'], offline: ['Offline: saved here', '⚠'],
    choose: ['Pick a save', '?'], error: ['Not saved to the cloud', '!']
  };
  function status() {
    if (!user) return 'out';
    if (choice) return 'choose';
    if (busyMsg) return 'saving';
    if (!connected) return 'offline';
    if (lastError) return 'error';
    if (inFlight || meta.dirty || pending) return 'saving';
    return 'synced';
  }
  function kidName() { var n = (typeof S !== 'undefined' && S && S.name) || ''; return n && n !== 'Champ' ? esc(n) + '\'s' : 'your'; }
  function when(t) {
    if (!t) return 'not yet';
    var d = new Date(t), now = new Date(), tm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'today at ' + tm;
    var y = new Date(now.getTime() - 864e5); if (d.toDateString() === y.toDateString()) return 'yesterday at ' + tm;
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + tm;
  }
  // Firebase error codes -> kind sentences
  function kind(e) {
    var c = String((e && (e.code || e.message)) || '');
    var M = {
      'auth/wrong-password': 'That password doesn\'t match. Try again, or tap "Forgot password?".',
      'auth/invalid-credential': 'That email and password don\'t match. Try again, or tap "Forgot password?".',
      'auth/invalid-login-credentials': 'That email and password don\'t match. Try again, or tap "Forgot password?".',
      'auth/user-not-found': 'There is no account with that email yet. Tap "Create an account" to make one.',
      'auth/email-already-in-use': 'That email already has an account. Tap "Sign in" instead.',
      'auth/weak-password': 'Please pick a longer password: at least 6 letters or numbers.',
      'auth/missing-password': 'Please type a password.',
      'auth/invalid-email': 'That email doesn\'t look right. Check it for typos.',
      'auth/missing-email': 'Please type an email address.',
      'auth/network-request-failed': 'Can\'t reach the internet right now. Check the Wi-Fi and try again.',
      'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site, then try again.',
      'auth/popup-closed-by-user': 'The sign-in window was closed before it finished. Tap the button to try again.',
      'auth/cancelled-popup-request': 'The sign-in window was closed before it finished. Tap the button to try again.',
      'auth/user-cancelled': 'Sign-in was cancelled. Tap the button to try again.',
      'auth/operation-not-allowed': 'This way of signing in isn\'t switched on yet. Tata needs to switch this on first.',
      'auth/configuration-not-found': 'Signing in isn\'t switched on yet. Tata needs to switch this on first.',
      'auth/admin-restricted-operation': 'This way of signing in isn\'t switched on yet. Tata needs to switch this on first.',
      'auth/unauthorized-domain': 'This web address isn\'t allowed to sign in yet. Tata needs to switch this on first.',
      'auth/too-many-requests': 'Lots of tries in a row. Take a short break and try again in a few minutes.',
      'auth/user-disabled': 'This account has been switched off.',
      'auth/account-exists-with-different-credential': 'That email already signs in another way. Try the other button.',
      'auth/credential-already-in-use': 'That account is already used on another player. Try signing in instead.',
      'auth/web-storage-unsupported': 'This browser is blocking sign-in (maybe a private window). Try a normal window.',
      'auth/operation-not-supported-in-this-environment': 'This browser can\'t open the sign-in page here. Try Safari or Chrome.',
      'auth/requires-recent-login': 'For safety, please sign out and sign in again first.',
      'PERMISSION_DENIED': 'The cloud said no. Tata may need to publish the new save rules first.'
    };
    for (var k in M) if (c.indexOf(k) >= 0) return M[k];
    if (/permission/i.test(c)) return M.PERMISSION_DENIED;
    return 'Something went wrong. Please try again in a moment.' + (c ? ' <small>(' + esc(c.slice(0, 60)) + ')</small>' : '');
  }
  function toast(html) {
    var t = document.createElement('div'); t.className = 'acct-toast'; t.innerHTML = html; document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2600); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
  }
  function show(html, onClose) { modal('<div class="acct-modal" data-acct-modal>' + html + '</div>', onClose); }
  function say(title, body) { show('<h2>' + title + '</h2><p class="acct-p">' + body + '</p><div class="row"><button class="btn green" data-act="acctClose">OK</button></div>'); }

  function chipHTML() {
    var st = status(), s = STATE[st] || STATE.out, label = user ? esc((S && S.name) || meta.who || 'Signed in') : s[0];
    return '<button class="acct-chip st-' + st + '" data-act="acctOpen" data-acct-chip aria-label="Account: ' + esc(s[0]) + '">' + CLOUD +
      '<span class="acct-chip-l">' + label + '</span>' + (user ? '<span class="acct-chip-s" title="' + esc(s[0]) + '">' + s[1] + '</span>' : '') + '</button>';
  }
  function statusLine() {
    var st = status(), s = STATE[st];
    var extra = st === 'offline' ? ' Progress is safe on this device and goes up when the internet is back.' : st === 'error' ? ' ' + lastError : st === 'choose' ? ' Tap "Pick a save" to choose.' : '';
    return '<div class="acct-status st-' + st + '"><b>' + s[1] + ' ' + (busyMsg || s[0]) + '</b>' + extra + '</div>' +
      '<div class="acct-small">Last saved to the cloud: ' + when(meta.syncedAt) + ' · This device: ' + esc(DEVICE) + '</div>';
  }
  function signInButtons() {
    return (PROV.google ? '<button class="btn big acct-google" data-act="acctGoogle">' + GLOGO + '<span>Continue with Google</span></button>' : '') +
      (PROV.email ? '<button class="btn ' + (PROV.google ? 'ghost acct-alt' : 'big blue') + '" data-act="acctEmailMode" data-arg="in">' + (PROV.google ? 'Use an email and password instead' : 'Sign in with email') + '</button>' : '');
  }
  function panelHTML() {
    var n = backups().length, h = '<div class="group acct-panel" data-acct-panel><h3>' + CLOUD + ' Account and cloud save</h3>';
    if (!user) {
      h += '<p class="acct-p">Sign in so ' + kidName() + ' progress is saved in the cloud. Sign in with the same account on another device and the progress is there too.</p>' +
        '<div class="acct-col">' + signInButtons() + '</div>';
    } else {
      h += '<p class="acct-p">Signed in as <b>' + esc(meta.who || user.name || user.email || '') + '</b>' + (user.email && user.email !== meta.who ? ' (' + esc(user.email) + ')' : '') + '</p>' + statusLine() +
        '<div class="acct-row">' + (choice ? '<button class="btn green" data-act="acctChoose" data-arg="ask">Pick a save</button>' : '<button class="btn green" data-act="acctSyncNow">Sync now</button>') +
        '<button class="btn" data-act="acctSignOut">Sign out</button></div>';
    }
    h += '<div class="acct-row">' + (n ? '<button class="btn small" data-act="acctBackups">Restore a backup (' + n + ')</button>' : '') +
      (user ? '<button class="btn small pink" data-act="acctDeleteAsk">Delete my cloud save</button>' : '') + '</div>';
    return h + '</div>';
  }
  function paint() {
    try {
      document.querySelectorAll('[data-acct-chip]').forEach(function (el) { el.outerHTML = chipHTML(); });
      document.querySelectorAll('[data-acct-panel]').forEach(function (el) { el.outerHTML = panelHTML(); });
      var live = document.querySelector('[data-acct-live]'); if (live) live.innerHTML = statusLine();
    } catch (e) {}
  }

  // ---- pop-ups ----
  function signInModal(mode, msg) {
    var body = '<h2>' + CLOUD + ' Save ' + kidName() + ' progress</h2>' +
      '<p class="acct-p">Sign in once on each device. The progress follows you, and this device keeps its own copy too.</p>' +
      (msg ? '<div class="acct-err" role="alert">' + msg + '</div>' : '');
    if (mode && PROV.email) {
      var create = mode === 'new', reset = mode === 'reset';
      body += '<form class="acct-form" data-mode="' + mode + '" autocomplete="on" novalidate>' +
        '<label class="acct-lab">Grown-up\'s email<input type="email" name="email" id="acctEmail" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required></label>' +
        (reset ? '' : '<label class="acct-lab">Password' + (create ? ' (at least 6 letters or numbers)' : '') + '<input type="password" name="password" id="acctPw" autocomplete="' + (create ? 'new-password' : 'current-password') + '" minlength="6" required></label>') +
        '<button type="submit" class="btn big green acct-go">' + (create ? 'Create an account' : reset ? 'Send me a reset email' : 'Sign in') + '</button></form>' +
        '<div class="acct-links">' +
        (mode !== 'in' ? '<button class="btn ghost" data-act="acctEmailMode" data-arg="in">I have an account: sign in</button>' : '') +
        (mode !== 'new' ? '<button class="btn ghost" data-act="acctEmailMode" data-arg="new">New here? Create an account</button>' : '') +
        (mode !== 'reset' ? '<button class="btn ghost" data-act="acctEmailMode" data-arg="reset">Forgot password?</button>' : '') + '</div>' +
        (PROV.google ? '<div class="acct-or">or</div><div class="acct-col"><button class="btn big acct-google" data-act="acctGoogle">' + GLOGO + '<span>Continue with Google</span></button></div>' : '');
    } else body += '<div class="acct-col">' + signInButtons() + '</div>';
    body += '<p class="acct-small">For grown-ups: only the game\'s progress is saved (levels, stars, badges, settings). Nothing is shared with anyone.</p>' +
      '<div class="row"><button class="btn" data-act="acctClose">Not now</button></div>';
    show(body);
    if (mode) setTimeout(function () { var f = document.getElementById('acctEmail'); if (f) f.focus(); }, 60);
  }
  function accountModal() {
    show('<h2>' + CLOUD + ' Account</h2><div data-acct-live>' + statusLine() + '</div>' +
      '<p class="acct-p">Signed in as <b>' + esc(meta.who || (user && (user.name || user.email)) || '') + '</b>.</p>' +
      '<div class="acct-col">' + (choice ? '<button class="btn big green" data-act="acctChoose" data-arg="ask">Pick a save</button>' : '<button class="btn big green" data-act="acctSyncNow">Sync now</button>') +
      '<button class="btn" data-act="acctSignOut">Sign out</button></div><div class="row"><button class="btn" data-act="acctClose">Close</button></div>');
  }
  function sumBox(title, s, when2, cls) {
    var m = AccountMerge.summary(s);
    return '<div class="acct-sum ' + cls + '"><div class="acct-sum-h">' + title + '</div>' +
      '<div><b>Level ' + m.level + '</b> · ' + m.xp + ' XP</div><div>' + m.beaten + ' of ' + m.creatures + ' creatures beaten</div>' +
      '<div>' + m.badges + ' badges · ' + m.correct + ' correct Solutions</div><div class="acct-small">Last played ' + when(when2 || m.last) + '</div></div>';
  }
  function askChoice() {
    var c = choice; if (!c) return;
    show('<h2>Two saves found!</h2><p class="acct-p">This device and the cloud both have progress. Which one should we keep? A backup of the one you don\'t keep stays on this device.</p>' +
      '<div class="acct-sums">' + sumBox(CLOUD + ' In the cloud' + (c.cloud.device ? ' (from ' + esc(c.cloud.device) + ')' : ''), c.data, c.cloud.updatedAt, 'cloud') + sumBox('This device', S, localAt(), 'here') + '</div>' +
      '<div class="acct-col"><button class="btn big green acct-two" data-act="acctChoose" data-arg="combine"><span>Combine: keep the best of both</span><small>Recommended. Highest level and XP, every badge and creature beaten.</small></button>' +
      '<button class="btn" data-act="acctChoose" data-arg="cloud">Keep the one from the cloud</button>' +
      '<button class="btn" data-act="acctChoose" data-arg="device">Keep this device\'s</button></div>' +
      '<div class="row"><button class="btn ghost" data-act="acctClose">Decide later</button></div>');
  }
  function busyButtons(on) { document.querySelectorAll('.acct-modal .btn, .acct-modal input').forEach(function (b) { b.disabled = !!on; }); }

  // ======================================================== taps ========================================================
  ACT.acctOpen = function () { if (user) { if (choice) askChoice(); else accountModal(); } else { signInModal(PROV.google ? null : 'in'); start().catch(function (e) { signInModal(null, kind(e)); }); } };
  ACT.acctClose = function () { closeModal(); };
  ACT.acctEmailMode = function (el) {
    var old = document.getElementById('acctEmail'), em = old ? old.value : '';
    start().catch(function () {}); signInModal(el.dataset.arg || 'in');
    var f = document.getElementById('acctEmail'); if (f && em) f.value = em;
  };
  ACT.acctGoogle = function () {
    function go2() { busyButtons(true); B.google().then(function (u) { if (u) onUser(u); closeModal(); toast(CLOUD + ' Signed in. Hi!'); }, function (e) { signInModal(null, kind(e)); }); }
    if (B.ready) go2(); // the SDK is loaded already: the pop-up opens straight from this tap
    else { busyButtons(true); start().then(go2, function (e) { signInModal(null, kind(e)); }); }
  };
  document.addEventListener('submit', function (e) {
    var f = e.target; if (!f || !f.classList || !f.classList.contains('acct-form')) return;
    e.preventDefault();
    var mode = f.dataset.mode, em = (f.querySelector('#acctEmail') || {}).value || '', pwEl = f.querySelector('#acctPw'), pw = pwEl ? pwEl.value : '';
    if (!em.trim()) { signInModal(mode, kind({ code: 'auth/missing-email' })); return; }
    if (mode !== 'reset' && !pw) { signInModal(mode, kind({ code: 'auth/missing-password' })); return; }
    busyButtons(true);
    start().then(function () {
      if (mode === 'reset') return B.reset(em.trim()).then(function () { say('Check your email', 'If there is an account for <b>' + esc(em.trim()) + '</b>, a link to pick a new password is on its way. Then come back and sign in.'); });
      var p = mode === 'new' ? B.emailCreate(em.trim(), pw) : B.emailSignIn(em.trim(), pw);
      pw = ''; if (pwEl) pwEl.value = '';
      return p.then(function (u) { if (u) onUser(u); closeModal(); toast(CLOUD + ' Signed in. Hi!'); });
    }).catch(function (x) { signInModal(mode, kind(x)); var i = document.getElementById('acctEmail'); if (i) i.value = em; });
  });
  ACT.acctChoose = function (el) { var w = el.dataset.arg; if (w === 'ask') { askChoice(); return; } closeModal(); choose(w); };
  ACT.acctSyncNow = function () {
    if (!user) return;
    if (!connected) { toast('⚠ Offline. It will save when the internet is back.'); return; }
    meta.dirty = true; saveMeta(); lastError = ''; push(); catchUp(); paint();
  };
  ACT.acctSignOut = function () {
    show('<h2>Sign out?</h2><p class="acct-p">Keep ' + kidName() + ' progress on this device?</p>' +
      '<div class="acct-col"><button class="btn big green acct-two" data-act="acctSignOutGo" data-arg="keep"><span>Yes, keep it here</span><small>Recommended. The game keeps playing as now; signing in again later syncs it.</small></button>' +
      '<button class="btn" data-act="acctSignOutGo" data-arg="clear">No, start fresh on this device</button></div>' +
      '<p class="acct-small">The cloud save stays safe either way. "Start fresh" keeps a backup on this device (Restore a backup).</p>' +
      '<div class="row"><button class="btn ghost" data-act="acctClose">Cancel</button></div>');
  };
  ACT.acctSignOutGo = function (el) {
    var clear = el.dataset.arg === 'clear', unsent = meta.dirty || inFlight;
    busyButtons(true);
    var flush = new Promise(function (ok) {
      if (!unsent || !connected) { ok(); return; }
      push(); var t0 = Date.now(), iv = setInterval(function () { if (!inFlight && !meta.dirty || Date.now() - t0 > 4000) { clearInterval(iv); ok(); } }, 150);
    });
    flush.then(function () {
      var lost = meta.dirty || inFlight;
      if (lost) clear = false; // never wipe progress that hasn't reached the cloud
      stopWatch(); var keepAt = meta.localAt; meta = { localAt: keepAt }; saveMeta();
      return B.signOut().then(function () {
        user = null;
        if (clear) { backup(S, 'This device before signing out'); S = defaults(); if (typeof applyOppNames === 'function') applyOppNames(); S.lastDedication = typeof today === 'function' ? today() : ''; rawPersist(); refreshUI(); }
        closeModal(); paint(); if (current === 'settings' && typeof renderSettings === 'function') renderSettings();
        if (lost) say('Signed out', 'Some progress hadn\'t reached the cloud yet (no internet), so it stays on this device. Sign in again later to send it up.');
        else toast(CLOUD + ' Signed out.' + (clear ? ' This device starts fresh.' : ''));
      });
    }).catch(function (e) { say('Could not sign out', kind(e)); });
  };
  ACT.acctBackups = function () {
    var list = backups();
    show('<h2>Restore a backup</h2><p class="acct-p">Copies saved on this device just before a sync or sign-out replaced the progress here (the last ' + BK_KEEP + ').</p>' +
      (list.length ? list.map(function (b) { var m = AccountMerge.summary(b.data); return '<div class="acct-bk"><div><b>' + when(b.at) + '</b><div class="acct-small">' + esc(b.why) + '</div><div>Level ' + m.level + ' · ' + m.xp + ' XP · ' + m.beaten + ' creatures beaten · ' + m.badges + ' badges</div></div><button class="btn small blue" data-act="acctRestore" data-arg="' + b.at + '">Restore</button></div>'; }).join('') : '<p class="acct-p">No backups yet.</p>') +
      '<div class="row"><button class="btn" data-act="acctClose">Close</button></div>');
  };
  ACT.acctRestore = function (el) {
    var b = backups().filter(function (x) { return String(x.at) === el.dataset.arg; })[0]; if (!b) return;
    var data = b.data;
    backup(S, 'This device before restoring a backup');
    adoptSave(data); meta.localAt = Date.now(); if (user && meta.uid === user.uid) { meta.dirty = true; saveMeta(); push(); } else saveMeta();
    closeModal(); refreshUI(); toast('✔ Backup restored.'); paint();
  };
  ACT.acctDeleteAsk = function () {
    show('<h2>Delete the cloud save?</h2><p class="acct-p">This removes ' + kidName() + ' progress from the cloud, and signs out every device using this account. <b>The progress on this device stays.</b> This can\'t be undone.</p>' +
      '<div class="row"><button class="btn" data-act="acctClose">Cancel</button><button class="btn pink" data-act="acctDeleteGo">Yes, delete it</button></div>');
  };
  ACT.acctDeleteGo = function () {
    if (!user) return; var uid = user.uid; busyButtons(true);
    stopWatch();
    B.remove(uid).then(function () {
      meta = { localAt: meta.localAt }; saveMeta();
      return B.signOut().then(function () { user = null; closeModal(); paint(); if (current === 'settings' && typeof renderSettings === 'function') renderSettings(); say('Cloud save deleted', 'The cloud copy is gone and this device is signed out. Everything on this device is still here.'); });
    }).catch(function (e) { startWatch(); say('Could not delete', kind(e)); });
  };

  // ---- push when leaving the page or switching away ----
  function flushSoon() { if (user && meta.dirty && !inFlight) push(); }
  window.addEventListener('pagehide', flushSoon);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSoon(); });

  // ---- start: right away in test mode, after a redirect, or when this device was signed in before ----
  var redirectFlag = false; try { redirectFlag = sessionStorage.getItem('tataAcct:redirect') === '1' || sessionStorage.getItem('tataAcct:redirect.' + DEV) === '1'; } catch (e) {}
  if (TEST || meta.uid || redirectFlag) start().catch(function () { connected = false; paint(); });

  return {
    chipHTML: chipHTML, panelHTML: panelHTML, authReady: authReady, idle: idle, status: status,
    syncNow: function () { ACT.acctSyncNow(); }, drop: function (on) { return B.drop ? B.drop(on) : false; },
    _debug: function () { return { user: user, meta: meta, pending: !!pending, inFlight: inFlight, choice: !!choice, connected: connected, status: status(), backups: backups().length }; }
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = { AccountMerge: AccountMerge };
