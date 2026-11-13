'use strict';
// ======================= SOCCER-CARD ALBUM =======================
// 44 collectible cards (CAREER: +10 for the Legend League) drawn in code (CSS + the game's own line icons: no image files). Creature cards show a
// head-and-shoulders picture of the 3D creature (T3.portrait, js/three/portraits.js) and fall back to the
// creature's emoji when 3D is unavailable or the picture is not ready yet.
// Every card has an explicit, checkable way to earn it. Nothing is random, nothing can be lost:
// once a card is earned it is saved in S.cards[id] = 'YYYY-MM-DD'.
//
// API:  Cards.check(evt)          -> array of newly earned cards (also saved). Safe to call any time, any number of times.
//       Cards.showNew(cards, done)-> shows a "New card!" pop-up for each card, one after the other, then calls done().
//       Cards.revealHTML(card)    -> HTML for one pop-up.
//       Cards.cardHTML(card, o)   -> one card (o.locked, o.isNew, o.mini).
//       Cards.albumHTML()         -> the album section for the Trophy Room.
// Tap handlers added here: ACT.cardView (opens one card big).
var Cards = (function () {
  function opp(i) { return (typeof OPPONENTS !== 'undefined' && OPPONENTS[i]) || { name: '?', title: '', emoji: '❓', color: '#e9ecef', num: '0' }; }
  function sget() { return (typeof S !== 'undefined' && S) || {}; }
  function badge(id) { var s = sget(); return !!(s.badges && s.badges[id]); }
  function campTotal() { var s = sget(), n = 0; if (s.camp) Object.keys(s.camp).forEach(function (k) { if (s.camp[k] && typeof s.camp[k].done === 'number') n += s.camp[k].done; }); return n; }
  function lvl() { return typeof level === 'function' ? level() : 1; }
  function todayStr() { return typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10); }

  // ----- Facts about the match that just ended (from the event, or from the live game G) -----
  function matchFacts(evt) {
    var f = { oppIdx: -1, won: false, noHint: false };
    if (!evt || evt.type !== 'match') return f;
    var g = (typeof G !== 'undefined') ? G : null, ai = !!(g && g.mode === 'ai' && g.players && g.players.length > 1);
    f.oppIdx = evt.oppIdx != null ? evt.oppIdx : (ai ? g.oppIdx : -1);
    f.won = evt.won != null ? !!evt.won : (ai ? g.players[0].score > g.players[1].score : false);
    // S.stats.noHint counts shakes in a row without a hint, so >= shakes in this match means no hint all match.
    f.noHint = evt.noHint != null ? !!evt.noHint : (g ? (sget().stats.noHint || 0) >= g.shakes : false);
    return f;
  }

  // ----- The set -----
  // kind: base | gold | skill.  creature: index in OPPONENTS (or 'pip').  icon: a name from ICONS (skill cards).
  var CREATURES = [
    { i: 0, id: 'snoozy', pos: 'Goalkeeper', stats: [['Naps', 99], ['Speed', 12], ['Cuddles', 95]] },
    { i: 1, id: 'penny', pos: 'Defender', stats: [['Slide', 90], ['Chill', 99], ['Waddle', 78]] },
    { i: 2, id: 'fox', pos: 'Striker', stats: [['Speed', 95], ['Cheek', 90], ['Shooting', 88]] },
    { i: 3, id: 'owl', pos: 'Midfielder', stats: [['Vision', 97], ['Patience', 99], ['Wisdom', 95]] },
    { i: 4, id: 'wizard', pos: 'Captain', stats: [['Magic', 99], ['Drama', 97], ['Flair', 96]] },
    // Monster League (opponents 6-10)
    { i: 5, id: 'grub', pos: 'Defender', stats: [['Grumble', 99], ['Tackles', 88], ['Snorts', 94]] },
    { i: 6, id: 'splosh', pos: 'Keeper', stats: [['Care', 99], ['Checks', 96], ['Saves', 90]] },
    { i: 7, id: 'blaze', pos: 'Winger', stats: [['Speed', 97], ['Heat', 99], ['Pounce', 93]] },
    { i: 8, id: 'hex', pos: 'Playmaker', stats: [['Tricks', 99], ['Twists', 95], ['Vision', 92]] },
    { i: 9, id: 'zog', pos: 'Captain', stats: [['Crown', 99], ['Power', 97], ['Calm', 95]] },
    // CAREER: Legend League (opponents 11-15)
    { i: 10, id: 'bleep', pos: 'Defender', stats: [['Logic', 99], ['Repeat', 98], ['Battery', 96]] },
    { i: 11, id: 'flip', pos: 'Winger', stats: [['Flips', 99], ['Swoop', 96], ['Hearing', 98]] },
    { i: 12, id: 'squiggle', pos: 'Keeper', stats: [['Reach', 99], ['Arms', 88], ['Wiggle', 97]] },
    { i: 13, id: 'nugget', pos: 'Striker', stats: [['Treasure', 99], ['Power', 98], ['Patience', 95]] },
    { i: 14, id: 'chroma', pos: 'Captain', stats: [['Colours', 99], ['Rules', 99], ['Calm', 97]] }
  ];
  var LIST = [];
  CREATURES.forEach(function (c) {
    LIST.push({ id: 'c-' + c.id, kind: 'base', creature: c.i, pos: c.pos, stats: c.stats,
      how: function () { return 'Win a match against ' + opp(c.i).name + '.'; },
      test: function () { return !!sget().beaten && !!sget().beaten[c.i]; } });
  });
  CREATURES.forEach(function (c) {
    LIST.push({ id: 'g-' + c.id, kind: 'gold', creature: c.i, pos: c.pos, stats: c.stats.map(function (s) { return [s[0], Math.min(99, s[1] + 4)]; }),
      how: function () { return 'Win against ' + opp(c.i).name + ' without using a single hint.'; },
      test: function (evt) { var m = matchFacts(evt); return m.oppIdx === c.i && m.won && m.noHint; } });
  });
  LIST.push({ id: 'c-pip', kind: 'base', creature: 'pip', pos: 'Mascot', stats: [['Bounce', 80], ['Cheer', 99], ['Teamwork', 90]],
    how: function () { return 'Finish the How to Play tutorial.'; }, test: function () { return !!sget().tutorialDone; } });
  LIST.push({ id: 'g-pip', kind: 'gold', creature: 'pip', pos: 'Mascot', stats: [['Bounce', 90], ['Cheer', 99], ['Teamwork', 96]],
    how: function () { return 'Earn 10 badges in the Trophy Room.'; },
    prog: function () { return Math.min(10, Object.keys(sget().badges || {}).length) + ' / 10'; },
    test: function () { return Object.keys(sget().badges || {}).length >= 10; } });

  function skill(id, name, icon, color, num, pos, stats, how, test, prog) { LIST.push({ id: id, kind: 'skill', name: name, icon: icon, color: color, num: num, pos: pos, stats: stats, how: function () { return how; }, test: test, prog: prog }); }
  skill('s-imp', 'Detective', 'ban', '#e5dbff', '13', 'Sleuth', [['Brain', 92], ['Nerve', 88], ['Eyes', 95]], 'Call Impossible! when nobody can make the Goal.', function () { return (sget().stats.impWins || 0) >= 1; });
  skill('s-now', 'Now! Caller', 'bolt', '#fff3bf', '11', 'Sprinter', [['Speed', 94], ['Nerve', 90], ['Timing', 86]], 'Call Now! and win the challenge.', function () { return (sget().stats.nowWins || 0) >= 1; });
  skill('s-big', 'Big Builder', 'cube', '#d3f9d8', '5', 'Architect', [['Planning', 90], ['Patience', 84], ['Cubes', 88]], 'Write a correct Solution with 5 or more cubes.', function () { return ((sget().best || {}).mostCubes || 0) >= 5; }, function () { return Math.min(5, (sget().best || {}).mostCubes || 0) + ' / 5 cubes'; });
  skill('s-mega', 'Mega Builder', 'cube', '#ffd8a8', '7', 'Builder', [['Planning', 97], ['Patience', 92], ['Cubes', 99]], 'Write a correct Solution with 7 or more cubes.', function () { return ((sget().best || {}).mostCubes || 0) >= 7; }, function () { return Math.min(7, (sget().best || {}).mostCubes || 0) + ' / 7 cubes'; });
  skill('s-camp10', 'Camp Cadet', 'cap', '#d0ebff', '10', 'Trainee', [['Practice', 80], ['Focus', 78], ['Hustle', 85]], 'Solve 10 Training Camp drills.', function () { return campTotal() >= 10; }, function () { return Math.min(10, campTotal()) + ' / 10 drills'; });
  skill('s-camp50', 'Camp Captain', 'cap', '#ffe066', '50', 'Captain', [['Practice', 96], ['Focus', 94], ['Hustle', 97]], 'Solve 50 Training Camp drills.', function () { return campTotal() >= 50; }, function () { return Math.min(50, campTotal()) + ' / 50 drills'; });
  skill('s-lvl5', 'Rising Star', 'star', '#ffe066', '15', 'Rookie', [['Heart', 88], ['Hustle', 82], ['Growth', 90]], 'Reach Level 5.', function () { return lvl() >= 5; }, function () { return 'Level ' + Math.min(5, lvl()) + ' / 5'; });
  skill('s-lvl10', 'Superstar', 'star', '#ffc83d', '10', 'Legend', [['Heart', 98], ['Hustle', 95], ['Fame', 99]], 'Reach Level 10.', function () { return lvl() >= 10; }, function () { return 'Level ' + Math.min(10, lvl()) + ' / 10'; });
  skill('s-perfect', 'Perfect Match', 'check', '#d3f9d8', '100', 'Cool Head', [['Accuracy', 99], ['Nerve', 94], ['Style', 90]], 'Win a match with a correct Solution every shake.', function () { return badge('perfect'); });
  skill('s-comeback', 'Comeback Kid', 'heart', '#ffc9c9', '17', 'Fighter', [['Courage', 97], ['Heart', 96], ['Grit', 99]], 'Be behind in a match, then win it.', function () { return badge('comeback'); });
  skill('s-biggoal', 'Goal Giant', 'target', '#ffe8cc', '50', 'Target Man', [['Reach', 93], ['Brain', 90], ['Power', 92]], 'Solve a Goal of 50 or more.', function () { return badge('bigGoal'); });
  skill('s-record', "Tata's Record", 'trophy', '#fff3bf', '16', 'Record Star', [['Goals', 99], ['Focus', 95], ['Glory', 99]], 'Beat Tata\'s record in one match.', function () { return badge('tata'); });

  function get(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function have(id) { var s = sget(); return !!(s.cards && s.cards[id]); }

  // Newly earned cards. Saves them to S.cards.
  function check(evt) {
    var s = sget(), won = [];
    if (typeof S === 'undefined') return won;
    if (!S.cards || typeof S.cards !== 'object') S.cards = {};
    LIST.forEach(function (c) {
      if (S.cards[c.id]) return;
      var ok = false; try { ok = !!c.test(evt || {}); } catch (e) { ok = false; }
      if (ok) { S.cards[c.id] = todayStr(); won.push(c); }
    });
    if (won.length && typeof persist === 'function') persist();
    return won;
  }

  // ----- Drawing -----
  function nameOf(c) { return c.kind === 'skill' ? c.name : c.creature === 'pip' ? 'Pip' : opp(c.creature).name; }
  function titleOf(c) { return c.kind === 'skill' ? 'Skill card' : c.creature === 'pip' ? 'the Cube' : opp(c.creature).title; }
  function numOf(c) { return c.kind === 'skill' ? c.num : c.creature === 'pip' ? '0' : opp(c.creature).num; }
  function colorOf(c) { return c.kind === 'skill' ? c.color : c.creature === 'pip' ? '#ffe066' : opp(c.creature).color; }
  // ----- Creature pictures (3D portraits) -----
  var PSIZE = 256;
  function imgHTML(url) { return '<img class="sc-portrait" src="' + url + '" alt="" draggable="false" style="display:block;width:100%;height:100%;object-fit:contain;border-radius:50%">'; }
  function portraitHTML(o) {
    var emo = '<span class="sc-emo">' + o.emoji + '</span>', T = window.T3, k = o.kind, pk = o.pack || 'classic', r = null;
    if (!k || !T || typeof T.portrait !== 'function') return emo;
    try { r = T.portrait(k, pk, PSIZE); } catch (e) { r = null; }
    if (typeof r === 'string') return imgHTML(r);
    if (r && typeof r.then === 'function') {
      var tag = k + '-' + pk;
      // the card is on screen by the time the picture is ready: swap the emoji for it (if the picture fails, the emoji stays)
      r.then(function (url) {
        if (!url) return;
        var els = document.querySelectorAll('.sc-emo[data-pt="' + tag + '"]');
        for (var i = 0; i < els.length; i++) els[i].outerHTML = imgHTML(url);
      }, function () { /* keep the emoji */ });
      return '<span class="sc-emo" data-pt="' + tag + '">' + o.emoji + '</span>';
    }
    return emo;
  }
  function artOf(c, locked) {
    var inner;
    if (c.kind === 'skill') inner = '<span class="sc-ico">' + (typeof ico === 'function' ? ico(c.icon) : '★') + '</span>';
    else if (c.creature === 'pip') inner = (typeof pipSVG === 'function') ? '<span class="sc-pip">' + pipSVG(locked ? 'happy' : 'cheer') + '</span>' : '<span class="sc-emo">🟨</span>';
    else inner = portraitHTML(opp(c.creature));
    return '<div class="sc-art" style="--c:' + colorOf(c) + '">' + inner + (c.kind === 'gold' && !locked ? '<span class="sc-star">★</span>' : '') + '</div>';
  }
  function statsHTML(c) {
    return '<div class="sc-stats">' + c.stats.map(function (s) { return '<div class="sc-st"><span>' + esc(s[0]) + '</span><i style="--v:' + s[1] + '"></i><b>' + s[1] + '</b></div>'; }).join('') + '</div>';
  }
  // o: { locked, isNew }
  function cardHTML(c, o) {
    o = o || {};
    var cls = 'scard sc-' + c.kind + (o.locked ? ' sc-locked' : '') + (o.isNew ? ' sc-new' : '');
    var tag = '';
    if (o.locked) {
      var pr = c.prog ? c.prog() : '';
      return '<div class="sc-wrap"><div class="' + cls + '" role="img" aria-label="Locked card. ' + esc(c.how()) + '">' +
        '<div class="sc-top"><span class="sc-num">?</span><span class="sc-pos">' + (c.kind === 'gold' ? 'GOLD' : c.kind === 'skill' ? 'SKILL' : 'CARD') + '</span></div>' +
        artOf(c, true) + '<div class="sc-name">???</div>' +
        '<div class="sc-how"><b>How to earn</b>' + esc(c.how()) + (pr ? '<em>' + esc(pr) + '</em>' : '') + '</div></div></div>';
    }
    return '<div class="sc-wrap"><div class="' + cls + '" style="--c:' + colorOf(c) + '">' +
      '<div class="sc-top"><span class="sc-num">' + esc(numOf(c)) + '</span><span class="sc-pos">' + esc(c.pos) + '</span></div>' +
      artOf(c) + '<div class="sc-name">' + esc(nameOf(c)) + '</div><div class="sc-title">' + esc(titleOf(c)) + '</div>' + statsHTML(c) + tag + '<span class="sc-shine"></span></div></div>';
  }
  function revealHTML(c) {
    var left = LIST.filter(function (x) { return !have(x.id); }).length;
    return '<h2 class="hero">New card!</h2><div class="sc-reveal" style="--w:min(230px,60vw)">' + cardHTML(c, { isNew: true }) + '</div>' +
      '<p style="text-align:center;margin:8px 0 2px"><b>' + esc(nameOf(c)) + '</b>' + (c.kind === 'gold' ? ' (Gold!)' : '') + ' is in your album.</p>' +
      '<p style="text-align:center;font-size:15px;color:var(--mute)">' + (LIST.length - left) + ' of ' + LIST.length + ' cards' + (left ? '' : ' - the whole set!') + '</p>' +
      '<div class="row"><button class="btn green" data-act="closeModal">Nice!</button></div>';
  }
  // Pop-ups, one after the other. done() fires once after the last one is closed.
  function showNew(cards, done) {
    cards = (cards || []).slice();
    function next() {
      var c = cards.shift();
      if (!c || typeof modal !== 'function') { if (done) done(); return; }
      try { if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); } catch (e) { /* sound is optional */ }
      modal(revealHTML(c), next);
    }
    next();
  }

  function albumHTML() {
    var s = sget(), n = 0;
    LIST.forEach(function (c) { if (have(c.id)) n++; });
    var groups = [['base', 'Team cards'], ['gold', 'Gold cards'], ['skill', 'Skill cards']];
    var html = '<h3 class="tierh">' + (typeof ico === 'function' ? ico('star') : '') + ' Soccer Card Album<small>' + n + ' / ' + LIST.length + '</small></h3>' +
      '<p class="sc-intro">Every card is earned by something you do. No luck, nothing to lose. Tap a card to see it.</p>';
    groups.forEach(function (g) {
      var list = LIST.filter(function (c) { return c.kind === g[0]; });
      html += '<h4 class="sc-grp">' + g[1] + '</h4><div class="sc-grid">' + list.map(function (c) {
        var got = have(c.id);
        return '<button type="button" class="sc-btn" data-act="cardView" data-arg="' + c.id + '" aria-label="' + (got ? esc(nameOf(c)) + (c.kind === 'gold' ? ' gold card' : ' card') : 'Locked card: ' + esc(c.how())) + '">' + cardHTML(c, { locked: !got }) + '</button>';
      }).join('') + '</div>';
    });
    return '<div class="sc-album">' + html + '</div>';
  }

  return { list: LIST, get: get, have: have, check: check, cardHTML: cardHTML, revealHTML: revealHTML, showNew: showNew, albumHTML: albumHTML, nameOf: nameOf };
})();

if (typeof ACT !== 'undefined') {
  ACT.cardView = function (el) {
    var c = Cards.get(el.dataset.arg); if (!c || typeof modal !== 'function') return;
    var got = Cards.have(c.id);
    modal('<h2 class="hero">' + (got ? Cards.nameOf(c) : 'Locked card') + '</h2><div class="sc-reveal" style="--w:min(230px,60vw)">' + Cards.cardHTML(c, { locked: !got }) + '</div>' +
      (got ? '<p style="text-align:center;font-size:16px;color:var(--mute)">Earned ' + esc(S.cards[c.id]) + '<br>' + esc(c.how()) + '</p>' : '<p style="text-align:center"><b>How to earn:</b> ' + esc(c.how()) + '</p>') +
      '<div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
  };
}
