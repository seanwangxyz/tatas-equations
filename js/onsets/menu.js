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
  function open() {
    OSUI.closeAll(); OT = null; ODR = null;
    if (window.OS3D) OS3D.end(); // (a 3D match hands the table back to Equations)
    api.view = 'menu'; go('onsets'); Snd.setMood('menu');
    var st = osState();
    var greet = st.tutorialDone ? pick(['Ready to count some cards?', 'Sets, sets, sets! Let\'s play.', 'Which creature will you beat at On-Sets today?']) : 'On-Sets is the sister game of Equations. Instead of numbers you name groups of cards. Start with <b>How to Play</b>!';
    $('#onsets').innerHTML =
      '<div class="title-top"><h1 class="logo os-logo">Tata\'s<span class="eq">On-Sets</span></h1></div>' +
      '<div class="os-greet">' + pipHTML('happy', 90, '') + '<div class="bubble">' + greet + '</div></div>' +
      starsBar() +
      '<nav class="menu os-menu" aria-label="On-Sets menu">' +
      '<button class="btn big green hero" data-act="osPick"><span class="bi">' + ico('play') + '</span><span class="bl">Play</span></button>' +
      '<button class="btn big orange" data-act="osTutorial"><span class="bi">' + ico('cap') + '</span><span class="bl">How to Play</span></button>' +
      '<button class="btn big yellow" data-act="osDrills"><span class="bi">' + ico('star') + '</span><span class="bl">Set Drills</span></button>' +
      '<button class="btn big blue" data-act="osPvp"><span class="bi">' + ico('play') + '</span><span class="bl">Two Players</span></button>' +
      '<button class="btn big pink" data-act="os3p"><span class="bi">' + ico('people') + '</span><span class="bl">Three Players</span></button>' +
      '<button class="btn big purple" data-act="osRules"><span class="bi">' + ico('bulb') + '</span><span class="bl">The Rules</span></button>' +
      '</nav>' +
      '<div class="menu-sub"><button class="btn ghost" data-act="osBackToEq">' + ico('home') + ' Back to Equations</button></div>';
  }
  function pickHTML() {
    var st = osState();
    var cards = OPPONENTS.map(function (o, i) {
      var openO = osOpen(i), L = OSAI.level(o);
      return '<div class="opp' + (openO ? '' : ' lock') + '" ' + (openO ? 'data-act="osPlayAI" data-arg="' + i + '"' : '') + ' role="button" tabindex="0">' +
        (st.beaten[i] ? '<span class="done">' + ico('check') + '</span>' : '') + avatarHTML(o, 'lg') + '<h3>' + esc(o.name) + '</h3><div class="otitle">' + esc(o.title) + '</div>' +
        '<div class="stars" aria-label="On-Sets strength ' + L + ' of 4">' + '●'.repeat(L) + '<span style="opacity:.3">' + '●'.repeat(4 - L) + '</span></div>' +
        '<small class="os-otip">' + ['', 'Sees short sets only', 'Sees medium sets', 'Sees long sets, careful', 'Sees every set'][L] + '</small>' +
        (openO ? '' : '<div class="lockbadge">' + ico('lock') + ' Beat ' + esc(OPPONENTS[i - 1].name) + ' first</div>') + '</div>';
    }).join('');
    return '<div class="hdr os-hdr"><button class="btn small ghost" data-act="osHome" aria-label="Back">' + ico('back') + '<span class="lbl">Back</span></button><h2>Pick an opponent</h2></div>' +
      '<div class="panel os-panel">' + (st.tutorialDone ? '' : '<p class="os-note">New to On-Sets? Try <b>How to Play</b> first: it takes two minutes.</p>') +
      '<div class="opps">' + cards + '</div><p class="os-note" style="margin-top:12px">● = how far the creature can see in On-Sets (4 levels). Beat a creature to open the next one. Each match is ' + (S.set.shakes || 3) + ' shakes; there are no timers.</p></div>';
  }
  ACT.osOpen = function () { open(); };
  ACT.osHome = function () { open(); };
  ACT.osPick = function () { api.view = 'pick'; go('onsets'); $('#onsets').innerHTML = pickHTML(); };
  ACT.osPlayAI = function (el) { var i = +el.dataset.arg; if (!osOpen(i)) return; osStartMatch('ai', i, {}); };
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
    modal('<h2 class="hero">On-Sets in a nutshell</h2>' +
      '<ul class="reasons os-rules">' +
      '<li><b>Cards:</b> 16 cards, each with a different mix of blue, red, green and yellow dots (one is blank). The dealer puts out 6 to 12 of them: the <b>Universe</b>.</li>' +
      '<li><b>Cubes:</b> colour cubes (B R G Y), operation cubes (∪ ∩ − ′), V (every card) and Λ (no cards), and digit cubes for the Goal.</li>' +
      '<li><b>Goal:</b> a number made with 1 to 3 digit cubes. Side by side adds, stacked multiplies, upside down is negative.</li>' +
      '<li><b>Moves:</b> one cube a turn to Required, Permitted or Forbidden.</li>' +
      '<li><b>Solution:</b> a Set Name whose set has exactly the Goal\'s number of cards. At least 2 cubes, all of Required, none of Forbidden. ′ comes first; use ( ) for everything else.</li>' +
      '<li><b>Now!</b> "I can do it now, with at most one more cube." <b>Impossible!</b> "Nobody can, ever." Right = 6, wrong = 2. After the last cube everybody writes: right = 4, wrong = 2.</li>' +
      '</ul><p class="os-note">From the AGLOA On-Sets Tournament Rules 2026-27 (Elementary, basic game). No timers here, and a few things are simplified: see ONSETS_RULES_SUMMARY.md.</p>' +
      '<div class="row"><button class="btn green" data-act="closeModal">Got it</button></div>');
  };
  // A big tile for the Equations title / Play menu.
  api.tileHTML = function () {
    var st = osState();
    return '<button class="btn big os-tile" data-act="osOpen" aria-label="Play Tata\'s On-Sets"><span class="os-tilecards"><i class="d-B"></i><i class="d-R"></i><i class="d-G"></i><i class="d-Y"></i></span><span class="bl">On-Sets<small>' + (st.tutorialDone ? ico('star') + ' ' + st.stars + ' · the set game' : 'NEW: the set game') + '</small></span></button>';
  };
  api.open = open;
  return api;
})();
