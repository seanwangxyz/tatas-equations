'use strict';
// ======================= DAILY PUZZLE =======================
var D = null;
// Puzzle 0 of a day is the Daily Puzzle (40 XP and a skill star). After it he can keep going: puzzles 1, 2, 3...
// each give 10 XP, and every 3rd one a skill star (house rule, so stars still mean skill and not just time).
function puzState() {
  var d = today();
  if (!S.puz || S.puz.date !== d) S.puz = { date: d, cur: S.dailyDone[d] ? 1 : 0, extra: (S.puz && S.puz.extra) || 0 };
  if (S.dailyDone[d] && S.puz.cur < 1) S.puz.cur = 1;
  return S.puz;
}
function puzDone() { return !!D && (D.n === 0 ? !!S.dailyDone[D.date] : D.n < puzState().cur); }
function makeDaily(dateStr, n) {
  n = n || 0;
  var st = stageInfo();
  var rand = Eq.rng(parseInt(dateStr.replace(/-/g, ''), 10) * 31 + stageIdx() * 7919 + n * 104729);
  for (var tries = 0; tries < 40; tries++) {
    var cubes = Eq.roll(rand).map(function (c) { return { id: c.id, color: c.color, s: c.s, zone: 'resources', order: c.id, locked: false }; });
    cubes.forEach(function (c) { if (!Eq.isDigit(c.s) && st.ops.indexOf(c.s) < 0) { c.zone = 'forbidden'; c.locked = true; } });
    var free = cubes.filter(function (c) { return c.zone === 'resources'; });
    var ideas = Eq.goalIdeas(free.map(function (c) { return c.s; }), { fractions: st.fractions }).filter(function (g) { return g.value.d === 1 && g.value.n >= 4 && g.value.n <= st.maxGoal && g.tokens.length >= 2; });
    if (!ideas.length) continue;
    var gi = ideas[Math.floor(rand() * ideas.length)], used = {};
    var gt = gi.tokens.map(function (s) { var c = free.find(function (x) { return x.s === s && !used[x.id]; }); used[c.id] = 1; c.zone = 'goal'; return { s: s, id: c.id }; });
    var rest = shuffle(free.filter(function (c) { return !used[c.id]; }), rand);
    var rd = rest.find(function (c) { return Eq.isDigit(c.s); }), ro = rest.find(function (c) { return !Eq.isDigit(c.s); });
    var k = 0;
    rest.forEach(function (c) {
      if (c === rd || (c === ro && tries % 2 === 0)) c.zone = 'required';
      else if (k++ < 6) c.zone = 'permitted';
      else c.zone = 'forbidden';
    });
    var req = cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.s; });
    var perm = cubes.filter(function (c) { return c.zone === 'permitted'; }).map(function (c) { return c.s; });
    var r = Eq.solve({ goal: gi.value, req: req, opt: perm, mode: 'free', fractions: st.fractions, maxDigits: 5, timeMs: 500 });
    if (r.found && r.tokens.filter(function (s) { return s !== '(' && s !== ')'; }).length >= 3) return { date: dateStr, n: n, cubes: cubes, goalTokens: gt, goal: gi.value, sample: r.tokens, fractions: st.fractions, revealed: false };
  }
  return null;
}
function makePuz(d, n) { var p = puzState(); for (var k = 0; k < 6; k++) { var x = makeDaily(d, n + k); if (x) { if (k && n >= p.cur) p.cur = n + k; return x; } } return null; }
function openDaily() {
  var d = today(), p = puzState();
  if (!D || D.date !== d || D.n !== p.cur) D = makePuz(d, p.cur);
  renderDaily(); go('daily');
}
function renderDaily() {
  var el = $('#daily');
  if (!D) { el.innerHTML = '<div class="hdr"><button class="btn small" data-act="camp">' + ico('back') + ' Camp</button><h2>' + ico('cal') + ' Daily Puzzle</h2></div><div class="panel">Hmm, no puzzle today. Try again later!</div>'; return; }
  function z(name) { return D.cubes.filter(function (c) { return c.zone === name; }).map(function (c) { return cubeHTML(c, 'mini'); }).join('') || '<span class="empty">empty</span>'; }
  var done = puzDone(), extra = D.n > 0;
  el.innerHTML = '<div class="hdr"><button class="btn small" data-act="camp">' + ico('back') + ' Camp</button><h2>' + ico('cal') + (extra ? ' Puzzle ' + (D.n + 1) + ' today' : ' Daily Puzzle') + '</h2></div>' +
    '<div class="panel" style="background:rgba(255,253,246,.97)"><div class="row">' + pipHTML(done ? 'cheer' : 'happy', 70, '') + '<div class="bubble">' +
    (done ? 'You solved today\'s puzzle! 🎉 Want another one? Tap Next puzzle. Or try finding another way here!' : (extra ? 'Puzzle ' + (D.n + 1) + ': make the Goal' : 'Today\'s puzzle: make the Goal') + ' using ALL the Required cubes and any Permitted cubes. Take as long as you like!') + '</div></div></div>' +
    '<div class="mat" style="margin-top:10px">' +
    '<div class="zone z-goal"><h3>🎯 GOAL <span class="gval">= ' + Eq.fmt(D.goal) + '</span></h3><div class="cubes">' + D.goalTokens.map(function (t) { return cubeHTML(D.cubes[t.id], 'mini'); }).join('') + '</div></div>' +
    '<div class="zrow"><div class="zone z-required"><h3>✅ REQUIRED <small>must use</small></h3><div class="cubes">' + z('required') + '</div></div>' +
    '<div class="zone z-permitted"><h3>👍 PERMITTED <small>may use</small></h3><div class="cubes">' + z('permitted') + '</div></div>' +
    '<div class="zone z-forbidden"><h3>⛔ FORBIDDEN <small>can\'t use</small></h3><div class="cubes">' + z('forbidden') + '</div></div></div></div>' +
    '<div class="row" style="margin-top:14px"><button class="btn big green" data-act="dailySolve">' + ico('pencil') + ' Solve it!</button><button class="btn" data-act="dailyReveal">Show me a Solution</button>' + (done || D.revealed ? '<button class="btn big" data-act="dailyNext">Next puzzle ▶</button>' : '') + '</div>';
}
ACT.dailySolve = function () {
  var pools = [{ label: '✅ Required (use them ALL)', ids: D.cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; }), req: true },
    { label: '👍 Permitted (use any)', ids: D.cubes.filter(function (c) { return c.zone === 'permitted'; }).map(function (c) { return c.id; }) },
    { label: '⛔ Forbidden (can\'t use)', ids: D.cubes.filter(function (c) { return c.zone === 'forbidden'; }).map(function (c) { return c.id; }), forb: true }];
  var t0 = Date.now();
  B = { kind: 'solution', mode: 'daily', tokens: [], pools: pools, cubes: D.cubes, goal: D.goal, goalTokens: D.goalTokens, fractions: D.fractions, title: 'Daily Puzzle', t0: t0,
    onDone: function (tokens) {
      var chk = Eq.checkSolution(tokens, { goal: D.goal, zone: function (id) { return D.cubes[id].zone; }, required: D.cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; }), mode: 'daily', fractions: D.fractions, label: function (id) { return show(D.cubes[id].s); } });
      xpLog = [];
      var gSave = G; G = null;
      if (chk.ok) {
        var p = puzState(), was = puzDone();
        if (!D.revealed) recordSolution(chk, Date.now() - t0, tokens, 'daily', D.goal, D.n > 0 || was);
        if (!was && !D.revealed) {
          if (D.n === 0) { S.dailyDone[D.date] = true; S.stats.daily++; addXP(40, 'Daily Puzzle solved!'); checkBadges({ type: 'daily' }); }
          else { p.extra++; addXP(10, 'Puzzle solved!'); if (p.extra % 3 === 0) { addStar(); xpLog.push('⭐ A skill star for 3 more puzzles!'); } }
        }
        if (!was && D.n >= p.cur) p.cur = D.n + 1;
        persist();
        Snd.chime(); victoryFX(); Snd.crowd();
        modal('<h2>🎉 You solved it!</h2>' + exprBox(tokens, D.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(D.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: D.goal, fractions: D.fractions, cubes: D.cubes, chk: chk }) : '') + /* EXPLAIN */ (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '') + '<div class="row"><button class="btn green" data-act="dailyNextM">Next puzzle ▶</button><button class="btn" data-act="closeModal">Stay here</button></div>', function () { drainQueue(function () { if (D && D.goNext) ACT.dailyNext(); else renderDaily(); }); });
      } else {
        if (!D.revealed) recordSolution(chk, Date.now() - t0, tokens, 'daily', D.goal, D.n > 0 || puzDone());
        Snd.boop();
        modal('<h2>🤔 Not quite!</h2>' + exprBox(tokens, D.cubes) + '<p>Here\'s why:</p><ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: D.goal, fractions: D.fractions, cubes: D.cubes, chk: chk }) : '') + /* EXPLAIN */ '<p style="text-align:center">You can try as many times as you want. No rush!</p><div class="row"><button class="btn green" data-act="closeModal">Try again</button></div>', function () { ACT.dailySolve(); });
      }
      G = gSave;
    } };
  renderBuilder(); $('#builder').classList.add('on');
};
ACT.dailyNext = function () {
  var p = puzState(); if (D && D.n >= p.cur) p.cur = D.n + 1;   // (after a peek he may move on too)
  persist(); D = makePuz(today(), p.cur); Snd.click(); renderDaily();
};
ACT.dailyNextM = function () { if (D) D.goNext = true; closeModal(); };
ACT.dailyReveal = function () {
  modal('<h2>👀 Peek at a Solution?</h2><p style="text-align:center">If you peek, today\'s puzzle won\'t give XP. Want to keep trying instead?</p><div class="row"><button class="btn green" data-act="closeModal">Keep trying</button><button class="btn" data-act="dailyRevealYes">Show me</button></div>');
};
ACT.dailyRevealYes = function () {
  D.revealed = true;
  modal('<h2>💡 One Solution</h2>' + exprBox(D.sample) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(D.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(D.sample, { goal: D.goal, fractions: D.fractions }) : '') + /* EXPLAIN */ '<p style="text-align:center">Can you find a different one?</p><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>');
};

// ======================= OTHER SCREENS =======================
function renderSetup() {
  var oppCards = OPPONENTS.map(function (o, i) {
    var open = oppOpen(i);
    return '<div class="opp' + (open ? '' : ' lock') + '" data-act="' + (open ? 'playOpp' : 'lockedOpp') + '" data-arg="' + i + '">' + (S.beaten[i] ? '<span class="done">' + ico('check') + '</span>' : '') + avatarHTML(o, 'lg') +
      '<h3>' + esc(o.name) + ' <span class="jersey" style="font-size:13px;height:22px;min-width:24px">' + o.num + '</span></h3><div class="otitle">' + esc(o.title) + '</div><div class="stars">' + oppStars(o) + '</div>' +
      (o.tip ? '<div class="otitle" style="margin-top:6px;font-size:13px;line-height:1.25">💡 Tip: ' + esc(o.tip) + '</div>' : '') +
      (o.taste ? '<div class="otitle" style="margin-top:4px;font-size:13px;line-height:1.25">🎲 Likes: ' + esc(o.taste) + '</div>' : '') +
      (window.Career ? Career.tagHTML(i) : '') + // CAREER: "Special rule: Use It Again"
      (window.Rivals && open ? Rivals.cardLineHTML(i) : '') + // RIVALS: "Rival 3-2 · Last: you won 10-6"
      (open ? '' : '<div class="lockbadge">' + ico('lock') + ' Beat ' + esc(OPPONENTS[i - 1].name) + ' to unlock</div>') + '</div>';
  });
  var opps = oppCards.slice(0, LEAGUE).join(''), monsters = oppCards.slice(LEAGUE, 2 * LEAGUE).join(''), legends = oppCards.slice(2 * LEAGUE).join(''); // CAREER
  var sTab = window.setupTab || 'opps';
  var sTabs = [['opps', ico('paw') + ' Creatures'], ['trio', '👑 Three at the table'], ['cups', ico('trophy') + ' Cups'], ['people', ico('people') + ' With people']].filter(function (t) { return (t[0] !== 'trio' || window.Trio) && (t[0] !== 'cups' || window.Cup); });
  if (!sTabs.some(function (t) { return t[0] === sTab; })) sTab = 'opps';
  function sPart(name) { return '<div class="stab" data-tab="' + name + '" style="display:' + (name === sTab ? 'block' : 'none') + '">'; }
  $('#setup').innerHTML = '<div class="hdr"><button class="btn small" data-act="home">' + ico('back') + ' Back</button><h2>' + ico('play') + ' Who do you want to play?</h2></div>' +
    '<div class="panel"><div class="seg setup-tabs" role="tablist" style="flex-wrap:wrap;margin-bottom:12px">' + sTabs.map(function (t) { return '<button role="tab" aria-selected="' + (t[0] === sTab) + '" class="' + (t[0] === sTab ? 'on' : '') + '" data-act="setupTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    sPart('opps') + '<h3 class="tierh" style="margin-top:0">' + ico('paw') + ' Play the creatures</h3><div class="opps">' + opps + '</div>' +
    '<h3 class="tierh">👹 Monster League <span style="font-weight:600;opacity:.7;font-size:14px">(the tough ones)</span></h3><div class="opps">' + monsters + '</div>' +
    (legends ? '<h3 class="tierh">🌟 Legend League <span style="font-weight:600;opacity:.7;font-size:14px">(each brings a special rule)</span> ' + (window.Career ? Career.buttonHTML('small') : '') + '</h3><div class="opps">' + legends + '</div>' : '') + // CAREER
    '</div>' + sPart('trio') + (window.Trio ? Trio.setupHTML() : '') + (window.Tourney ? '<h3 class="tierh">⚖️ Tournament practice</h3><div class="opps">' + Tourney.tileHTML() + '</div>' : '') + '</div>' + // TOURNEY
    sPart('cups') + (window.Cup ? Cup.setupHTML() : '') + '</div>' +
    sPart('people') + '<h3 class="tierh" style="margin-top:0">' + ico('people') + ' Play with people</h3><div class="opps">' +
    (window.Online ? Online.setupCardHTML() : '') +
    (window.Team ? Team.setupCardHTML() : '') +
    (window.Tourney ? Tourney.tileHTML() : '') + // TOURNEY
    (typeof giftTileHTML === 'function' ? giftTileHTML() : '') +
    '<div class="opp mode" data-act="playP3"><span class="avatar lg" style="background:#ffe8cc;color:#c2410c;font-size:46px">' + ico('people') + '</span><h3>3 Players</h3><div class="otitle">Family game: 3 people, or 2 people + a creature</div></div>' +
    '<div class="opp mode" data-act="playPvp"><span class="avatar lg" style="background:#ffd6d6;color:#c92a2a;font-size:46px">' + ico('people') + '</span><h3>2 Players</h3><div class="otitle">Pass-and-play on this device</div></div>' +
    '</div></div><div class="row" style="margin-top:18px"><b style="font-family:var(--display);font-weight:400;font-size:20px">Shakes per match</b><div class="seg">' + [1, 3, 5].map(function (n) { return '<button class="' + (S.set.shakes === n ? 'on' : '') + '" data-act="setShakes" data-arg="' + n + '">' + n + '</button>'; }).join('') + '</div></div></div>';
}
ACT.playOpp = function (el) { startMatch('ai', +el.dataset.arg); };
ACT.playPvp = function () { startMatch('pvp'); };
ACT.playP3 = function () {
  var c = S.p3 || {};
  var opts = OPPONENTS.map(function (o, i) { return oppOpen(i) ? '<option value="' + i + '"' + (c.creature === i ? ' selected' : '') + '>' + o.emoji + ' ' + esc(o.name) + '</option>' : ''; }).join('');
  modal('<h2 class="hero">3 Players</h2>' +
    '<div class="setrow"><label>Player 1</label><b>' + esc(S.name) + '</b> <span class="jersey">' + esc(S.jersey || '7') + '</span></div>' +
    '<div class="setrow"><label>Player 2</label><input type="text" id="p3n2" maxlength="14" value="' + esc(c.n2 || 'Tata') + '"></div>' +
    '<div class="setrow"><label>Player 3 is…</label><select id="p3kind"><option value="person">a person</option><option value="creature"' + (c.creature >= 0 ? ' selected' : '') + '>a creature</option></select></div>' +
    '<div class="setrow"><label>Person\'s name</label><input type="text" id="p3n3" maxlength="14" value="' + esc(c.n3 || 'Mama') + '"></div>' +
    '<div class="setrow"><label>…or creature</label><select id="p3c">' + opts + '</select></div>' +
    '<p style="font-size:15px">Turns go around in order. After any move, <b>either</b> other player may challenge. After a challenge, the third player may write a Solution too.</p>' +
    '<div class="row"><button class="btn green big" data-act="startP3">' + ico('play') + ' Start</button><button class="btn" data-act="closeModal">Cancel</button></div>');
};
ACT.startP3 = function () {
  var n2 = ($('#p3n2').value || '').trim().slice(0, 14) || 'Tata', n3 = ($('#p3n3').value || '').trim().slice(0, 14) || 'Mama';
  var kind = $('#p3kind').value, c = +$('#p3c').value;
  S.p3 = { n2: n2, n3: n3, creature: kind === 'creature' ? c : -1 }; persist();
  closeModal(); startMatch('p3', null, S.p3);
};
ACT.lockedOpp = function (el) { var i = +el.dataset.arg; Snd.boop(); modal('<h2 class="hero">Locked</h2><p style="text-align:center">Win a match against <b>' + esc(OPPONENTS[i - 1].name) + '</b> to unlock ' + esc(OPPONENTS[i].name) + '!</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>'); };
ACT.setShakes = function (el) { S.set.shakes = +el.dataset.arg; persist(); renderSetup(); };

function renderTrophies() {
  var tiers = [['bronze', 'Bronze'], ['silver', 'Silver'], ['gold', 'Gold'], ['special', 'Special']];
  var n = Object.keys(S.badges).length, L = level();
  function lockNote(s) { return '<br><small>' + ico('lock') + ' Level ' + s.lvl + '</small>'; }
  var html = '<div class="hdr"><button class="btn small" data-act="home">' + ico('back') + ' Back</button><h2>' + ico('trophy') + ' Trophy Room</h2></div><div class="panel">' +
    '<div class="profile"><div><div class="big">Level ' + L + '<small>' + esc(S.name) + '</small></div></div>' + xpBarHTML() + '<div class="big">' + n + '<small>of ' + BADGES.length + ' badges</small></div></div>';
  html += '<div class="row" style="justify-content:flex-start;margin:10px 0 2px">' +
    (window.Career ? Career.buttonHTML('yellow') : '') + (window.Cabinet ? Cabinet.buttonHTML('purple') : '') + (window.Fans ? Fans.buttonHTML('green') : '') + (window.Season ? Season.buttonHTML('blue') : '') + '</div>';
  tiers.forEach(function (t) {
    var list = BADGES.filter(function (b) { return b.tier === t[0]; }), got = list.filter(function (b) { return S.badges[b.id]; }).length;
    html += '<h3 class="tierh"><span class="medal tier-' + t[0] + '" style="margin:0;width:30px;height:30px;font-size:0;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18)"></span> ' + t[1] + '<small>' + got + ' / ' + list.length + '</small></h3><div class="badges">' + list.map(function (b) {
      var e = S.badges[b.id];
      return '<div class="bdg' + (e ? '' : ' off') + '">' + medalHTML(b, !!e) + '<b>' + (e ? esc(b.name) : '???') + '</b><small>' + (e ? 'Earned ' + e : 'How to earn: ' + esc(b.hint)) + '</small></div>';
    }).join('') + '</div>';
  });
  if (window.Cup && Cup.trophyHTML) html += Cup.trophyHTML();
  if (typeof Cards !== 'undefined' && Cards.albumHTML) html += Cards.albumHTML(); // Soccer Card Album (js/cards.js)
  if (typeof Kit !== 'undefined') html += '<h3 class="tierh">' + ico('star') + ' My kit</h3><div class="row" style="justify-content:flex-start;margin:6px 0 12px"><button class="btn green" data-act="openKit">' + ico('star') + ' Design my kit</button></div>';
  html += '<h3 class="tierh">' + ico('cube') + ' Cube Skins</h3><div class="cos">' + SKINS.map(function (s) { var open = L >= s.lvl; return '<div class="it' + (S.cos.skin === s.id ? ' on' : '') + (open ? '' : ' lock') + '" data-act="' + (open ? 'pickSkin' : 'lockedCos') + '" data-arg="' + s.id + '" data-lvl="' + s.lvl + '"><div class="skin-' + s.id + ' row" style="gap:4px;margin-bottom:6px"><span class="cube tiny c-red"><span>7</span></span><span class="cube tiny c-blue"><span>+</span></span><span class="cube tiny c-green"><span>4</span></span></div>' + s.name + (open ? '' : lockNote(s)) + '</div>'; }).join('') + '</div>';
  html += '<h3 class="tierh">' + ico('dice') + ' Mat Themes</h3><div class="cos">' + MATS.map(function (s) { var open = L >= s.lvl; return '<div class="it' + (S.cos.mat === s.id ? ' on' : '') + (open ? '' : ' lock') + '" data-act="' + (open ? 'pickMat' : 'lockedCos') + '" data-arg="' + s.id + '" data-lvl="' + s.lvl + '"><div class="swatch" style="background:' + s.sw + '"></div>' + s.name + (open ? '' : lockNote(s)) + '</div>'; }).join('') + '</div>';
  html += '<h3 class="tierh">' + ico('star') + ' Victory Celebrations</h3><div class="cos">' + VICTORIES.map(function (s) { var open = L >= s.lvl; return '<div class="it' + (S.cos.victory === s.id ? ' on' : '') + (open ? '' : ' lock') + '" data-act="' + (open ? 'pickVic' : 'lockedCos') + '" data-arg="' + s.id + '" data-lvl="' + s.lvl + '"><div style="font-size:36px;line-height:1.2">' + s.icon + '</div>' + s.name + (open ? '' : lockNote(s)) + '</div>'; }).join('') + '</div>';
  html += '</div>';
  $('#trophies').innerHTML = html;
}
ACT.pickSkin = function (el) { S.cos.skin = el.dataset.arg; persist(); applyCosmetics(); Snd.pop(); renderTrophies(); };
ACT.pickMat = function (el) { S.cos.mat = el.dataset.arg; persist(); applyCosmetics(); Snd.pop(); renderTrophies(); };
ACT.pickVic = function (el) { S.cos.victory = el.dataset.arg; persist(); Snd.pop(); victoryFX(); renderTrophies(); };
ACT.lockedCos = function (el) { Snd.boop(); modal('<h2 class="hero">Not yet!</h2><p style="text-align:center">Reach <b>Level ' + el.dataset.lvl + '</b> to unlock this. You earn XP for correct Solutions and smart challenges!</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>'); };

function renderStats() {
  var h = S.history, last = h.slice(-20), prev = h.slice(-40, -20);
  function acc(a) { return a.length ? Math.round(100 * a.filter(function (x) { return x.ok; }).length / a.length) : null; }
  var aL = acc(last), aP = acc(prev);
  var msg = (aL !== null && aP !== null && aL > aP) ? '📈 You\'re getting better! ' + aP + '% → ' + aL + '% correct' : (h.length ? '🧠 Every try makes your brain stronger!' : 'Play a game to start your stats!');
  // accuracy by day (last 10 days played)
  var days = {}; h.forEach(function (x) { var d = new Date(x.t), k = (d.getMonth() + 1) + '/' + d.getDate(); days[k] = days[k] || { n: 0, ok: 0 }; days[k].n++; if (x.ok) days[k].ok++; });
  var keys = Object.keys(days).slice(-10), W = 520, H = 180, bw = keys.length ? Math.min(44, (W - 40) / keys.length - 8) : 40;
  var bars = keys.map(function (k, i) { var p = days[k].ok / days[k].n, bh = Math.max(3, p * (H - 50)), x = 30 + i * (bw + 8); return '<rect x="' + x + '" y="' + (H - 25 - bh) + '" width="' + bw + '" height="' + bh + '" rx="6" fill="#51cf66"/><text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" font-size="12" text-anchor="middle" fill="#495057">' + k + '</text><text x="' + (x + bw / 2) + '" y="' + (H - 30 - bh) + '" font-size="12" text-anchor="middle" fill="#2b8a3e" font-weight="bold">' + Math.round(p * 100) + '%</text>'; }).join('');
  var chart = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Correct answers per day"><line x1="24" y1="' + (H - 25) + '" x2="' + (W - 6) + '" y2="' + (H - 25) + '" stroke="#ced4da"/>' + (bars || '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="#868e96">No games yet</text>') + '</svg>';
  function st(v, l) { return '<div class="stat"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
  var opsLine = Eq.OPS.map(function (o) { return show(o) + ' ' + (S.opsUsed[o] || 0); }).join(' &nbsp; ');
  $('#stats').innerHTML = '<div class="hdr"><button class="btn small" data-act="home">' + ico('back') + ' Back</button><h2>' + ico('chart') + ' My Stats</h2><button class="btn small" data-act="parentOpen" data-arg="stats">For Tata</button></div><div class="panel">' +
    '<div class="better">' + msg + '</div>' +
    '<div class="statgrid">' + st(S.stats.correct, 'Correct Solutions') + st(acc(h) === null ? '–' : acc(h) + '%', 'Accuracy (all time)') + st(S.best.fastMs ? fmtMs(S.best.fastMs) : '–', 'Fastest Solution') +
    st(S.best.hardGoalText || '–', 'Hardest Goal reached') + st(S.best.mostCubes || '–', 'Most cubes in a Solution') + st(S.stats.challengeWins + ' / ' + S.stats.challenges, 'Challenges won') +
    st('Lv ' + level(), S.xp + ' XP') + st(S.stats.daily, 'Daily Puzzles solved') + st(S.stats.bestMatch, 'Best match score') + '</div>' +
    '<div class="chart"><b>Correct answers by day</b>' + chart + '</div>' +
    '<div class="chart"><b>Operations you\'ve used:</b> <span style="font-size:20px">' + opsLine + '</span></div></div>';
}

function renderSettings() {
  var st = stageInfo();
  var faces = Eq.COLORS.map(function (c) { return '<tr><td><b>' + c + '</b></td><td>' + Eq.CUBE_FACES[c].map(function (s) { return '<span class="cube tiny c-' + c + '"><span>' + show(s) + '</span></span>'; }).join(' ') + '</td></tr>'; }).join('');
  $('#settings').innerHTML = '<div class="hdr"><button class="btn small" data-act="home">' + ico('back') + ' Back</button><h2>' + ico('gear') + ' Settings</h2></div><div class="panel">' +
    '<div class="seg" style="flex-wrap:wrap;margin-bottom:12px">' + ['Sound', 'You', 'Easier', 'The game', 'Parent corner', 'Account'].map(function (n) { return '<button data-act="setJump" data-arg="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
    '<div class="group"><h3>' + ico('sound') + ' Sound</h3>' +
    '<div class="setrow"><label>Music volume</label><input type="range" min="0" max="1" step="0.05" value="' + S.set.music + '" data-set="music"></div>' +
    '<div class="setrow"><label>Sound effects</label><input type="range" min="0" max="1" step="0.05" value="' + S.set.sfx + '" data-set="sfx"></div>' +
    '<div class="setrow"><label>Mute everything</label><button class="btn small ' + (S.set.mute ? 'pink' : '') + '" data-act="toggleMute">' + (S.set.mute ? 'Muted' : 'Sound on') + '</button></div>' +
    '<div class="setrow"><label>Sound check<br><small style="font-weight:600">Hear every sound, balance music, crowd, voices and ambience, and report one that sounds wrong.</small></label><button class="btn small" data-act="soundCheck">Open</button></div></div>' +
    '<div class="group"><h3>' + ico('people') + ' You</h3>' +
    '<div class="setrow"><label>Your name</label><input type="text" maxlength="14" value="' + esc(S.name) + '" id="nameInput"><button class="btn small" data-act="saveName">Save</button></div>' +
    '<div class="setrow"><label>Name on the back of the shirt</label><input type="text" maxlength="12" value="' + esc(backName()) + '" id="backInput"><button class="btn small" data-act="saveBack">Save</button></div>' +
    '<div class="setrow"><label>Your jersey number</label><input type="text" maxlength="2" style="width:70px" value="' + esc(S.jersey || '7') + '" id="jerseyInput"><button class="btn small" data-act="saveJersey">Save</button></div></div>' +
    '<div class="group"><h3>' + ico('paw') + ' Name your creatures</h3>' + OPPONENTS.map(function (o, i) { return '<div class="setrow"><label>' + o.emoji + ' ' + esc(o.title.replace(/^the /, 'The ')) + ' #' + o.num + '</label><input type="text" maxlength="14" class="oppName" data-i="' + i + '" placeholder="' + esc(DEFAULT_OPP_NAMES[i]) + '" value="' + esc((S.oppNames || [])[i] || '') + '"></div>'; }).join('') +
    '<div class="row" style="justify-content:flex-start;margin:8px 0 4px"><button class="btn small" data-act="saveOppNames">Save names</button></div></div>' +
    (window.A11y ? A11y.settingsHTML() : '') + // A11Y: Colour helpers, High-contrast colours, Text size, Reduce flashing
    '<div class="group"><h3>' + ico('dice') + ' The game</h3>' +
    '<div class="setrow"><label>Shakes per match</label><div class="seg">' + [1, 3, 5].map(function (n) { return '<button class="' + (S.set.shakes === n ? 'on' : '') + '" data-act="setShakes2" data-arg="' + n + '">' + n + '</button>'; }).join('') + '</div></div>' +
    [['gloat', 'Creatures gloat when they win', true], ['trash', 'Creatures trash-talk (playful teasing)', true], ['bluff', 'Creatures bluff (say things that may not be true)', false], ['babble', 'Creature voices (cute babble when they talk)', true], ['avatar', 'Show me at the table (3D)', true], ['shots', 'Camera close-ups (challenges, wins, the Goal)', true], ['crowd', 'Crowd reactions (claps, cheers, oohs)', true], ['walkout', 'Walk-out before a match (the players come out onto the pitch)', true], ['toss', 'Toss for who sets the first Goal (off: ' + esc(S.name) + ' always goes first)', true], ['replay', 'Goal replays (the Solution flies together)', true], ['commentary', 'Commentator (one line on the big moments)', true], ['fireworks', 'Fireworks on big wins', true]].map(function (x) { var on = x[2] ? S.set[x[0]] !== false : S.set[x[0]] === true; return '<div class="setrow"><label>' + x[1] + '</label><button class="btn small ' + (on ? 'green' : '') + '" data-act="toggleSet" data-arg="' + x[0] + '" data-def="' + (x[2] ? 1 : 0) + '">' + (on ? '✔ On' : 'Off') + '</button></div>'; }).join('') +
    '<div class="setrow"><label>Read lines aloud</label><button class="btn small ' + (S.set.voice === true ? 'green' : '') + '" data-act="toggleVoice">' + (S.set.voice === true ? '✔ Voice on' : 'Voice off') + '</button></div>' +
    '<div class="setrow"><label>3D table and dice</label>' + (T3.supported ? '<button class="btn small ' + (S.set.three !== false ? 'green' : '') + '" data-act="toggle3d">' + (S.set.three !== false ? '✔ 3D on' : '3D off (flat mat)') + '</button>' : '<span>Not available on this device (or no internet to load it), so the flat mat is used.</span>') + '</div>' +
    (window.Tour ? '<div class="setrow"><label>What\'s new<br><small style="font-weight:600">A short tour of the newest things.</small></label><button class="btn small" data-act="tourReplay">Show me</button></div>' : '') +
    '<div class="setrow"><label>Title screen show<br><small style="font-weight:600">The 3D opening: cubes, the crowd, a fanfare. Off: a still picture, no title sounds.</small></label><button class="btn small ' + (S.set.titleFx !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="titleFx" data-def="1">' + (S.set.titleFx !== false ? '✔ On' : 'Off') + '</button></div>' +
    (T3.supported ? '<div class="setrow"><label>Stadium weather<br><small style="font-weight:600">Time of day and weather for stadium matches. Rain and snow stop on Fast.</small></label><div class="seg" style="flex-wrap:wrap">' + [['auto', 'Surprise me'], ['clear', 'Always sunny'], ['golden', 'Sunset'], ['dusk', 'Evening'], ['night', 'Night'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog']].map(function (q) { var cur = S.set.weather === false ? 'clear' : (S.set.weather || 'auto'); return '<button class="' + (cur === q[0] ? 'on' : '') + '" data-act="setWeatherPick" data-arg="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div></div>' : '') +
    (T3.supported ? '<div class="setrow"><label>My player looks like<br><small style="font-weight:600">Pick Grown-up on Tata\'s own device.</small></label><div class="seg">' + [['kid', 'Kid'], ['tata', 'Grown-up']].map(function (q) { return '<button class="' + ((S.set.me || 'kid') === q[0] ? 'on' : '') + '" data-act="setMe" data-arg="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div></div>' : '') +
    (T3.supported ? '<div class="setrow"><label>Look around the table<br><small style="font-weight:600">Drag the background with the mouse, or two fingers on a tablet. Pinch or scroll to zoom.</small></label><button class="btn small ' + (S.set.orbit !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="orbit" data-def="1">' + (S.set.orbit !== false ? '✔ On' : 'Off') + '</button></div>' : '') +
    (T3.supported ? '<div class="setrow"><label>3D picture quality<br><small style="font-weight:600">Auto picks what this device can run smoothly.</small></label><div class="seg">' + [['auto', 'Auto'], ['low', 'Fast'], ['high', 'Pretty']].map(function (q) { return '<button class="' + ((S.set.quality || 'auto') === q[0] ? 'on' : '') + '" data-act="setQuality3d" data-arg="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div></div>' : '') +
    '<div class="setrow"><label>Watch the intro again</label><button class="btn small" data-act="replayIntro">Play intro</button></div></div>' +
    (window.Account ? Account.panelHTML() : '') + // ACCOUNT
    (window.PWA ? PWA.settingsHTML() : '') + // PWA: app on this device (install, offline, updates)
    '<div class="group"><h3>' + ico('disk') + ' Move progress to another device</h3>' +
    '<p>Copy this code, then paste it into Settings on the other device and tap <b>Load</b>.</p>' +
    '<textarea id="exportBox" readonly>' + exportCode() + '</textarea><div class="row" style="justify-content:flex-start;margin:6px 0"><button class="btn small" data-act="copyCode">Copy code</button></div>' +
    '<textarea id="importBox" placeholder="Paste a TATA-… code here"></textarea><div class="row" style="justify-content:flex-start;margin:6px 0"><button class="btn small blue" data-act="importIt">Load</button></div></div>' +
    '<div class="group"><h3>' + ico('cap') + ' Parent corner</h3>' +
    '<div class="setrow"><label>For Tata: how he is doing<br><small style="font-weight:600">Skills, where he gets stuck, playing time. Grown-ups only (press and hold).</small></label><button class="btn small blue" data-act="parentOpen" data-arg="settings">Open</button></div>' +
    '<div class="setrow"><label>Operations in play<br><small style="font-weight:600">Tap to switch each one on or off. Locked ones start in Forbidden with a 🔒.</small></label><div class="row" style="gap:6px;justify-content:flex-start">' +
      Eq.OPS.map(function (o) { var on = st.ops.indexOf(o) >= 0; return '<button class="btn small ' + (on ? 'green' : '') + '" data-act="opToggle" data-arg="' + o + '" style="min-width:52px;font-size:20px">' + show(o) + '</button>'; }).join('') +
      '<button class="btn small ' + (st.fractions ? 'green' : '') + '" data-act="opToggle" data-arg="frac">Fractions</button></div></div>' +
    '<div class="setrow"><label>' + (S.opsManual ? 'You picked these by hand. Stars are not unlocking anything right now.' : 'Automatic: he unlocks more by earning skill stars (now on <b>' + st.icon + ' ' + st.name + '</b>).') + '</label><button class="btn small ' + (S.opsManual ? '' : 'green') + '" data-act="opsAuto">' + (S.opsManual ? 'Back to automatic' : '✔ Automatic') + '</button><button class="btn small" data-act="opsAll">All on</button></div>' +
    '<div class="setrow"><label>Variation cards<br><small style="font-weight:600">An extra official rule for one shake (like "0 is Wild"). They start once + − × ÷ are mastered, one new card every 4 stars. Unlocked: ' + (window.Vari ? Vari.unlockedCount() : 0) + ' of ' + (window.Vari ? Vari.CARDS.length : 5) + '.</small></label><button class="btn small ' + (S.set.variations !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="variations" data-def="1">' + (S.set.variations !== false ? '✔ On' : 'Off') + '</button></div>' +
    (window.Vari && Vari.parentHTML ? Vari.parentHTML() : '') +
    (window.Tourney ? Tourney.parentHTML() : '') + // TOURNEY: open now / Middle list / practice clock / strict penalties
    (window.Bonus ? Bonus.parentHTML() : '') + // BONUS dice (house rule): a switch per die and per Power face, unlock now
    (window.VoiceChat ? VoiceChat.parentHTML() : '') + // VOICE: allow talking in online games (press and hold), per device
    (T3.supported ? '<div class="setrow"><label>Speed overlay<br><small style="font-weight:600">A small box with the frame rate and a 20-second benchmark (for sending a speed report).</small></label><button class="btn small ' + (localStorage.getItem('tataEq.perf') === '1' ? 'green' : '') + '" data-act="perfToggle">' + (localStorage.getItem('tataEq.perf') === '1' ? '✔ On' : 'Off') + '</button></div>' : '') +
    '<div class="setrow"><label>Pip\'s tip after a match<br><small style="font-weight:600">A "💡 One thing Pip spotted" button on the results screen. It only shows a moment the game can prove. Tips opened: ' + ((S.tips && S.tips.seen) || 0) + '</small></label><button class="btn small ' + (S.set.review !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="review" data-def="1">' + (S.set.review !== false ? '✔ On' : 'Off') + '</button></div>' +
    '<div class="setrow"><label>"Beat Tata\'s Record" needs ' + TATA_RECORD + ' points in one match (change <code>TATA_RECORD</code> near the top of the game code). Best so far: ' + S.stats.bestMatch + '</label></div>' +
    '<div class="setrow"><label>Cube faces in this game (see RULES_SUMMARY.md)</label><table class="facetable">' + faces + '</table></div>' +
    (window.PWA ? PWA.parentRowHTML() : '') + // PWA: Reset app cache
    '<div class="setrow"><label>Start over from zero</label><button class="btn small pink" data-act="resetAsk">Reset progress</button></div></div>' +
    '</div>';
}
ACT.pickPack = function (el) { if (el.dataset.ok !== '1') { Snd.boop(); modal('<h2>Not installed yet</h2><p style="text-align:center">The monster models need to be downloaded and added to the game first. The classic creatures are used until then.</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>'); return; } S.cos.pack = el.dataset.arg; persist(); Snd.pop(); renderSettings(); };
ACT.toggleSet = function (el) { var k = el.dataset.arg, on = el.dataset.def === '1' ? S.set[k] !== false : S.set[k] === true; S.set[k] = !on; persist(); Snd.click(); renderSettings(); };
ACT.toggleVoice = function () { S.set.voice = S.set.voice !== true; persist(); if (S.set.voice) Snd.speak('Hi! I will read the lines out loud.', 'pip'); else if (Snd.stopSpeak) Snd.stopSpeak(); renderSettings(); };
ACT.setQuality3d = function (el) { S.set.quality = el.dataset.arg; persist(); if (T3.setQuality) T3.setQuality(S.set.quality); Snd.click(); renderSettings(); };
ACT.toggle3d = function () { S.set.three = S.set.three === false; persist(); renderSettings(); };
ACT.toggleMute = function () { S.set.mute = !S.set.mute; persist(); Snd.apply(); if (!S.set.mute) Snd.musicOn(); renderSettings(); };
ACT.saveJersey = function () { var v = ($('#jerseyInput').value || '').replace(/[^0-9]/g, '').slice(0, 2); if (v) { S.jersey = v; persist(); Snd.chime(); } renderSettings(); };
ACT.saveOppNames = function () { S.oppNames = OPPONENTS.map(function (o, i) { var el = document.querySelector('.oppName[data-i="' + i + '"]'); return el ? el.value.trim().slice(0, 14) : ''; }); persist(); applyOppNames(); Snd.chime(); renderSettings(); };
ACT.saveName = function () { var v = ($('#nameInput').value || '').trim().slice(0, 14); if (v) { S.name = v; persist(); Snd.chime(); } renderSettings(); };
ACT.setShakes2 = function (el) { S.set.shakes = +el.dataset.arg; persist(); renderSettings(); };
ACT.replayIntro = function () { S.lastDedication = ''; runIntro(); };
ACT.copyCode = function () { var t = $('#exportBox'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { try { document.execCommand('copy'); } catch (x) {} } Snd.pop(); };
ACT.importIt = function () {
  if (importCode($('#importBox').value)) { applyOppNames(); applyCosmetics(); Snd.chime(); modal('<h2>✅ Progress loaded!</h2><div class="row"><button class="btn green" data-act="closeModal">Great</button></div>', function () { renderSettings(); }); }
  else { Snd.boop(); modal('<h2>Hmm, that code didn\'t work</h2><p style="text-align:center">Make sure you copied the whole code, starting with TATA-.</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>'); }
};
ACT.opToggle = function (el) {
  var st = stageInfo(), m = { ops: st.ops.slice(), fractions: !!st.fractions }, k = el.dataset.arg;
  if (k === 'frac') m.fractions = !m.fractions;
  else { var i = m.ops.indexOf(k); if (i >= 0) { if (m.ops.length === 1) { Snd.boop(); return; } m.ops.splice(i, 1); } else m.ops.push(k); }
  S.opsManual = m; S.unlockAll = false; persist(); Snd.click(); renderSettings();
};
ACT.opsAuto = function () { S.opsManual = null; S.unlockAll = false; persist(); Snd.pop(); renderSettings(); };
ACT.opsAll = function () { S.opsManual = { ops: Eq.OPS.slice(), fractions: true }; S.unlockAll = false; persist(); Snd.pop(); renderSettings(); };
ACT.toggleUnlock = function () { S.unlockAll = !S.unlockAll; persist(); renderSettings(); };
ACT.resetAsk = function () { modal('<h2>Reset everything?</h2><p style="text-align:center">This erases XP, badges, unlocks and stats on this device. It can\'t be undone (unless you saved an export code).</p><div class="row"><button class="btn" data-act="closeModal">Cancel</button><button class="btn pink" data-act="resetYes">Yes, reset</button></div>'); };
ACT.resetYes = function () { S = defaults(); applyOppNames(); S.lastDedication = today(); persist(); applyCosmetics(); closeModal(); gotoTitle(); };
document.addEventListener('input', function (e) {
  var k = e.target.dataset && e.target.dataset.set;
  if (k) { S.set[k] = +e.target.value; persist(); Snd.apply(); if (k === 'music' && S.set.music > 0) Snd.musicOn(); if (k === 'sfx') Snd.click(); }
});

ACT.setMe = function (el) { S.set.me = el.dataset.arg; persist(); Snd.click(); renderSettings(); };
['saveJersey', 'saveName'].forEach(function (k) { var f = ACT[k]; if (f) ACT[k] = function () { var r = f.apply(this, arguments); if (T3.playerRefresh) T3.playerRefresh(); return r; }; });

ACT.setWeatherPick = function (el) { S.set.weather = el.dataset.arg; persist(); Snd.click(); renderSettings(); };

ACT.saveBack = function () { var v = ($('#backInput').value || '').trim().slice(0, 12); S.backName = v; persist(); Snd.chime(); if (T3.playerRefresh) T3.playerRefresh(); renderSettings(); };

ACT.setupTab = function (el) { window.setupTab = el.dataset.arg; Snd.click(); renderSetup(); $('#setup').scrollTop = 0; };
ACT.setJump = function (el) { var want = el.dataset.arg.toLowerCase(), hs = [].slice.call(document.querySelectorAll('#settings h3')), h = hs.filter(function (x) { return x.textContent.toLowerCase().indexOf(want) >= 0; })[0]; Snd.click(); if (h) h.scrollIntoView({ block: 'start' }); else say0('That part is not on this device yet.'); };
function say0() {}

ACT.soundCheck = function () { Snd.soundCheck(); };
ACT.perfToggle = function () { var on = localStorage.getItem('tataEq.perf') !== '1'; try { localStorage.setItem('tataEq.perf', on ? '1' : '0'); } catch (e) {} if (on && window.tataLoadPerf) tataLoadPerf(); else if (window.PerfHUD) PerfHUD.hide(); Snd.click(); renderSettings(); };
