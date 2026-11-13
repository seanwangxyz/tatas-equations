'use strict';
// ======================= TATA'S ON-SETS: ENTRY POINT + MENU =======================
// Onsets.open()     -> the On-Sets menu on the #onsets screen
// Onsets.tileHTML() -> a big button for the title / Play menu (data-act="osOpen")
// Progress: S.onsets (see osState() in js/onsets/game.js), separate from Equations.
var Onsets = (function () {
  var api = { view: 'menu' };
  function starsBar() {
    var st = osState(), L = osLevel(st.stars), cur = OS_LEVELS[L], nxt = OS_LEVELS[L + 1];
    var pct = nxt ? Math.round(100 * (st.stars - cur.at) / (nxt.at - cur.at)) : 100;
    return '<div class="playercard os-pc"><span class="jersey">' + esc(S.jersey || '7') + '</span><div class="pc-main"><div class="pc-name">' + esc(S.name) + ' · ' + esc(cur.name) + '</div>' +
      '<div class="xpbar"><i style="width:' + pct + '%"></i><span>' + ico('star') + ' ' + st.stars + ' On-Sets star' + (st.stars === 1 ? '' : 's') + (nxt ? ' · next level at ' + nxt.at : ' · top level!') + '</span></div></div></div>';
  }
  // the creature the big Play button plays: the first open one he has not beaten yet, else the one he played last
  function nextOpp() {
    var st = osState();
    for (var i = 0; i < OPPONENTS.length; i++) if (osOpen(i) && !st.beaten[i]) return i;
    return st.last != null && osOpen(st.last) ? st.last : 0;
  }
  function tile(cls, act, icon, label, sub, extra) {
    return '<button class="btn mm-tile ' + cls + '" data-act="' + act + '"><span class="bi">' + ico(icon) + '</span><span class="bl">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (extra || '') + '</button>';
  }
  function open() {
    OSUI.closeAll(); OT = null; ODR = null;
    if (window.OS3D) OS3D.end(); // (a 3D match hands the table back to Equations)
    api.view = 'menu'; go('onsets'); Snd.setMood('menu');
    var st = osState(), nx = OPPONENTS[nextOpp()], fresh = !st.tutorialDone;
    var greet = fresh ? 'On-Sets is the sister game of Equations. Instead of numbers you name groups of cards. Start with <b>How to Play</b>!' : pick(['Ready to count some cards?', 'Sets, sets, sets! Let\'s play.', 'Which creature will you beat at On-Sets today?']);
    $('#onsets').innerHTML =
      '<div class="title-top"><h1 class="logo os-logo">Tata\'s<span class="eq">On-Sets</span></h1></div>' +
      '<div class="os-wrap">' +
      '<div class="os-greet">' + pipHTML('happy', 84, '') + '<div class="bubble">' + greet + '</div></div>' +
      starsBar() +
      '<nav class="os-mm' + (fresh ? ' os-new' : '') + '" aria-label="On-Sets menu">' +
      '<div class="os-grp g-learn"><h2 class="os-h">Learn</h2><div class="os-modes">' +
      tile('orange' + (fresh ? ' startme' : ''), 'osTutorial', 'cap', 'How to Play', fresh ? '<b class="os-start">START HERE</b> two minutes' : 'Two minutes, any time', fresh ? '' : '<span class="tick">' + ico('check') + '</span>') +
      tile('purple', 'osRules', 'bulb', 'The Rules', 'On-Sets in a nutshell') +
      '</div></div>' +
      '<div class="os-grp g-prac"><h2 class="os-h">Practise</h2>' +
      tile('yellow', 'osDrills', 'star', 'Set Drills', 'Count, name, make a set, spot a Now! No timers.') +
      '</div>' +
      '<div class="os-grp g-play"><h2 class="os-h">Play</h2>' +
      '<div class="os-hero"><button class="btn big green hero mm-play" data-act="osPlayNext"><span class="bi">' + ico('play') + '</span><span class="bl">Play<small>against ' + esc(nx.name) + '</small></span></button>' +
      '<button class="btn mm-pick" data-act="osPick">' + ico('paw') + '<span>Pick who</span></button></div>' +
      '<div class="os-modes">' + tile('blue', 'osPvp', 'people', '2 Players', 'Pass and play') + tile('pink', 'os3p', 'people', '3 Players', 'With a grown-up or creatures') + '</div>' +
      '</div>' +
      '</nav>' +
      '<div class="os-foot"><button class="btn ghost" data-act="osBackToEq">' + ico('home') + ' Back to Equations</button></div>' +
      '</div>';
  }
  // The creature cards: the same trading cards as the Equations Play screen (league colour band, portrait, name, dots, icon lines)
  var SEES = ['', 'Sees short sets only', 'Sees medium sets', 'Sees long sets, and is careful', 'Sees every set'];
  function oppCard(o, i) {
    var st = osState(), openO = osOpen(i), L = OSAI.level(o);
    return '<div class="opp' + (openO ? '' : ' lock') + '" data-act="' + (openO ? 'osPlayAI' : 'osLocked') + '" data-arg="' + i + '" role="button" tabindex="0" aria-label="' + esc(o.name) + (openO ? '' : ', locked') + '">' +
      (st.beaten[i] ? '<span class="done">' + ico('check') + '</span>' : '') + avatarHTML(o, 'lg') +
      '<h3>' + esc(o.name) + ' <span class="jersey" style="font-size:13px;height:22px;min-width:24px">' + o.num + '</span></h3><div class="otitle">' + esc(o.title) + '</div>' +
      '<div class="stars os-dots" role="img" aria-label="On-Sets strength ' + L + ' of 4">' + '<b class="on">●</b>'.repeat(L) + '<b>●</b>'.repeat(4 - L) + '</div>' +
      '<div class="o-line">' + ico('bulb') + '<span>' + SEES[L] + '</span></div>' +
      (st.beaten[i] ? '<div class="o-line taste">' + ico('star') + '<span>You beat ' + esc(o.name) + ' at On-Sets!</span></div>' : '') +
      (openO ? '' : '<div class="lockbadge">' + ico('lock') + ' Beat ' + esc(OPPONENTS[i - 1].name) + ' to unlock</div>') + '</div>';
  }
  function pickHTML() {
    var st = osState(), cards = OPPONENTS.map(oppCard), sh = S.set.shakes || 3;
    return '<div class="hdr os-hdr"><button class="btn small" data-act="osHome" aria-label="Back">' + ico('back') + ' Back</button><h2>' + ico('play') + ' Who do you want to play?</h2></div>' +
      '<div class="panel os-panel">' + (st.tutorialDone ? '' : '<p class="os-note">New to On-Sets? Try <b>How to Play</b> first: it takes two minutes.</p>') +
      '<h3 class="tierh lg-1" style="margin-top:0"><span class="lg-dot"></span> Play the creatures</h3><div class="opps lg-1">' + cards.slice(0, LEAGUE).join('') + '</div>' +
      '<h3 class="tierh lg-2"><span class="lg-dot"></span> Monster League <span class="tsub">(the tough ones)</span></h3><div class="opps lg-2">' + cards.slice(LEAGUE, 2 * LEAGUE).join('') + '</div>' +
      '<h3 class="tierh lg-3"><span class="lg-dot"></span> Legend League</h3><div class="opps lg-3">' + cards.slice(2 * LEAGUE).join('') + '</div>' +
      '<p class="os-note" style="margin-top:12px">The dots show how far a creature can see in On-Sets. Beat a creature to open the next one.</p></div>' +
      '<div class="setup-foot"><b>Shakes per match</b><div class="seg">' + [1, 3, 5].map(function (n) { return '<button class="' + (sh === n ? 'on' : '') + '" data-act="osShakes" data-arg="' + n + '">' + n + '</button>'; }).join('') + '</div></div>';
  }
  ACT.osOpen = function () { open(); };
  ACT.osHome = function () { open(); };
  ACT.osPick = function () { api.view = 'pick'; go('onsets'); $('#onsets').innerHTML = pickHTML(); };
  ACT.osShakes = function (el) { S.set.shakes = +el.dataset.arg; persist(); Snd.click(); $('#onsets').innerHTML = pickHTML(); };
  ACT.osLocked = function (el) { var i = +el.dataset.arg; Snd.boop(); modal('<h2 class="hero">Locked</h2><p style="text-align:center">Win an On-Sets match against <b>' + esc(OPPONENTS[i - 1].name) + '</b> to unlock ' + esc(OPPONENTS[i].name) + '!</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>'); };
  ACT.osPlayNext = function () { var i = nextOpp(); osStartMatch('ai', i, {}); };
  ACT.osPlayAI = function (el) { var i = +el.dataset.arg; if (!osOpen(i)) return; var st = osState(); st.last = i; persist(); osStartMatch('ai', i, {}); };
  ACT.osPvp = function () {
    var st = osState();
    modal('<h2 class="hero">Two players</h2><p style="text-align:center">Pass and play on this device. ' + esc(S.name) + ' plays first. Who is the second player?</p>' +
      '<div class="setrow"><label for="osP2">Second player</label><input id="osP2" type="text" maxlength="14" value="' + esc(st.p2 || 'Tata') + '"></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="osPvpGo">' + ico('play') + ' Start</button><button class="btn" data-act="closeModal">Back</button></div>');
  };
  ACT.osPvpGo = function () {
    var inp = document.getElementById('osP2'), n = (inp && inp.value || '').trim() || 'Player 2', st = osState();
    st.p2 = n; persist(); closeModal(); osStartMatch('pvp', -1, { p2: n });
  };
  ACT.osTutorial = function () { osStartTutorial(); };
  ACT.osDrills = function () { osOpenDrills(); };
  ACT.osBackToEq = function () { if (window.OS3D) OS3D.end(); OSUI.closeAll(); OG = null; OT = null; ODR = null; gotoTitle(); };
  // ---- Three players (rules IV-B, VI-C, VII: the Third Party; see ONSETS_RULES_SUMMARY.md) ----
  function openIdx() { return OPPONENTS.map(function (o, i) { return i; }).filter(osOpen); }
  function oppChips(act, picked) {
    return '<div class="os-chips">' + openIdx().map(function (i) {
      var o = OPPONENTS[i], on = picked && picked.indexOf(i) >= 0;
      return '<button class="os-chip' + (on ? ' on' : '') + '" data-act="' + act + '" data-arg="' + i + '">' + avatarHTML(o, 'sm') + '<b>' + esc(o.name) + '</b><small>' + '●'.repeat(OSAI.level(o)) + '</small></button>';
    }).join('') + '</div>';
  }
  var trio = null;
  ACT.os3p = function () {
    var two = openIdx().length >= 2;
    modal('<h2 class="hero">' + ico('people') + ' Three players</h2><div class="mm-opts os-3p">' +
      '<button class="mm-opt' + (two ? '' : ' lock') + '" data-act="' + (two ? 'os3pAI' : 'closeModal') + '"><span class="mm-oi" style="background:#e5dbff">' + ico(two ? 'paw' : 'lock') + '</span><span class="mm-ot"><b>You against two creatures</b><small>' + (two ? 'Pick any two creatures you have opened.' : 'Beat a creature first so two are open.') + '</small></span></button>' +
      '<button class="mm-opt" data-act="os3pFam" data-arg="c"><span class="mm-oi" style="background:#ffe8cc">' + ico('people') + '</span><span class="mm-ot"><b>You, a grown-up and a creature</b><small>Two people on this device and one creature.</small></span></button>' +
      '<button class="mm-opt" data-act="os3pFam" data-arg="p"><span class="mm-oi" style="background:#d3f9d8">' + ico('people') + '</span><span class="mm-ot"><b>Three people</b><small>Pass and play on this device.</small></span></button>' +
      '</div><p class="os-note">With three players, the one who didn\'t challenge is the <b>Third Party</b> and may write a Solution too (4 or 6 if correct).</p>' +
      '<div class="row"><button class="btn" data-act="closeModal">' + ico('back') + ' Back</button></div>');
  };
  ACT.os3pAI = function () { trio = []; trioModal(); };
  function trioModal() {
    modal('<h2 class="hero">Pick two creatures</h2><p class="os-note">' + (trio.length < 2 ? 'Tap ' + (2 - trio.length) + ' more.' : 'Ready!') + '</p>' + oppChips('os3pPick', trio) +
      '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="os3pGo"' + (trio.length === 2 ? '' : ' disabled') + '>' + ico('play') + ' Start</button><button class="btn" data-act="os3p">' + ico('back') + ' Back</button></div>');
  }
  ACT.os3pPick = function (el) { var i = +el.dataset.arg, k = trio.indexOf(i); if (k >= 0) trio.splice(k, 1); else if (trio.length < 2) trio.push(i); Snd.click(); trioModal(); };
  ACT.os3pGo = function () { if (!trio || trio.length !== 2) return; closeModal(); osStartMatch('ai3', -1, { a: trio[0], b: trio[1] }); };
  var fam = null;
  ACT.os3pFam = function (el) {
    var st = osState(); fam = { creature: el.dataset.arg === 'c' ? (fam && fam.creature >= 0 ? fam.creature : openIdx()[0]) : -1 };
    famModal(st);
  };
  function famModal(st) {
    var withC = fam.creature >= 0;
    modal('<h2 class="hero">' + (withC ? 'You, a grown-up and a creature' : 'Three people') + '</h2>' +
      '<div class="setrow"><label for="osN2">Second player</label><input id="osN2" type="text" maxlength="14" value="' + esc(st.p2 || 'Tata') + '"></div>' +
      (withC ? '<p class="os-note">Which creature?</p>' + oppChips('os3pCre', [fam.creature]) : '<div class="setrow"><label for="osN3">Third player</label><input id="osN3" type="text" maxlength="14" value="' + esc(st.p3 || 'Mama') + '"></div>') +
      '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="os3pFamGo">' + ico('play') + ' Start</button><button class="btn" data-act="os3p">' + ico('back') + ' Back</button></div>');
  }
  ACT.os3pCre = function (el) {
    var st = osState(), n2 = document.getElementById('osN2'); if (n2) st.p2 = (n2.value || '').trim() || st.p2;
    fam.creature = +el.dataset.arg; Snd.click(); famModal(st);
  };
  ACT.os3pFamGo = function () {
    var st = osState(), n2 = document.getElementById('osN2'), n3 = document.getElementById('osN3');
    var a = (n2 && n2.value || '').trim() || 'Player 2', b = (n3 && n3.value || '').trim() || 'Player 3';
    st.p2 = a; if (n3) st.p3 = b; persist(); closeModal();
    osStartMatch('p3', -1, fam.creature >= 0 ? { n2: a, creature: fam.creature } : { n2: a, n3: b, creature: -1 });
  };
  ACT.osRules = function () {
    var cu = function (s) { return OSUI.cubeHTML({ s: s }, 'mini'); }, card = function (n) { return OSUI.cardHTML(n, { small: true }); };
    function row(pic, text) { return '<div class="os-rr"><div class="pic">' + pic + '</div><p>' + text + '</p></div>'; }
    modal('<h2 class="hero">On-Sets in a nutshell</h2><div class="os-rulerows">' +
      row(card(5) + card(10) + card(0), '<b>Cards:</b> 16 cards, each with a different mix of blue, red, green and yellow dots (one is blank). The dealer puts out 6 to 12 of them: the <b>Universe</b>.') +
      row(cu('B') + cu('R') + cu('U') + cu('V') + cu('N'), '<b>Cubes:</b> colour cubes (B R G Y), operation cubes (∪ ∩ − ′), V (every card) and Λ (no cards), and digit cubes for the Goal.') +
      row('<span class="os-bigpic">' + ico('target') + '</span>', '<b>Goal:</b> a number made with 1 to 3 digit cubes. Side by side adds, stacked multiplies, upside down is negative.') +
      row('<span class="os-zchips"><i class="rq">Required</i><i class="pm">Permitted</i><i class="fb">Forbidden</i></span>', '<b>Moves:</b> one cube a turn to Required, Permitted or Forbidden.') +
      row(cu('B') + cu('U') + cu('R'), '<b>Solution:</b> a Set Name whose set has exactly the Goal\'s number of cards. At least 2 cubes, all of Required, none of Forbidden. ′ comes first; use ( ) for everything else.') +
      row('<span class="os-bigpic">' + ico('bolt') + '</span>', '<b>Now!</b> "I can do it now, with at most one more cube." <b>Impossible!</b> "Nobody can, ever." Right = 6, wrong = 2. After the last cube everybody writes: right = 4, wrong = 2.') +
      '</div><p class="os-note">From the AGLOA On-Sets Tournament Rules 2026-27 (Elementary, basic game). No timers here, and a few things are simplified: see ONSETS_RULES_SUMMARY.md.</p>' +
      '<div class="row"><button class="btn green big" data-act="closeModal">Got it</button></div>');
  };
  // A big tile for the Equations title / Play menu.
  api.tileHTML = function () {
    var st = osState();
    return '<button class="btn os-tile" data-act="osOpen" aria-label="Play Tata\'s On-Sets"><span class="os-tilecards"><i class="d-B"></i><i class="d-R"></i><i class="d-G"></i><i class="d-Y"></i></span><span class="bl">On-Sets<small>' + (st.tutorialDone ? ico('star') + ' ' + st.stars + ' · the set game' : 'NEW: the set game') + '</small></span><span class="os-tgo">' + ico('play') + '</span></button>';
  };
  api.open = open;
  return api;
})();
