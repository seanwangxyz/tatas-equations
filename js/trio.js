'use strict';
// ======================= THREE AT THE TABLE =======================
// The kid against TWO creatures at once (mode 'ai3'), with the official 3-player rules that js/game.js
// already uses for three people. House rules of this mode (not from the rulebook):
//   - A "Trio" is a set pair of creatures. Beating both in one match (finishing alone in first place) earns a crown.
//   - He may only pick creatures he has already unlocked on the one-on-one ladder.
//   - Crowns never unlock opponents; the ladder stays one-on-one.
var Trio = (function () {
  function list() {
    var out = [], L, k;
    for (L = 0; (L + 1) * LEAGUE <= OPPONENTS.length; L++) for (k = 0; k < LEAGUE - 1; k++) out.push([L * LEAGUE + k, L * LEAGUE + k + 1]);
    if (OPPONENTS.length >= 2 * LEAGUE) out.push([LEAGUE - 1, 2 * LEAGUE - 1]);   // the two league bosses together
    return out;
  }
  function key(a, b) { return Math.min(a, b) + '-' + Math.max(a, b); }
  function won(a, b) { return !!(S.trios && S.trios[key(a, b)]); }
  function crowns() { return list().filter(function (p) { return won(p[0], p[1]); }).length; }
  function open(a, b) { return oppOpen(a) && oppOpen(b); }
  function pairFace(a, b) { return '<span style="display:inline-flex;gap:4px;justify-content:center">' + avatarHTML(OPPONENTS[a]) + avatarHTML(OPPONENTS[b]) + '</span>'; }
  function setupHTML() {
    var cards = list().map(function (p) {
      var a = p[0], b = p[1], ok = open(a, b);
      return '<div class="opp' + (ok ? '' : ' lock') + '" data-act="' + (ok ? 'playTrio' : 'lockedTrio') + '" data-arg="' + a + '-' + b + '">' + (won(a, b) ? '<span class="done">👑</span>' : '') + pairFace(a, b) +
        '<h3>' + esc(OPPONENTS[a].name) + ' + ' + esc(OPPONENTS[b].name) + '</h3><div class="otitle">' + (won(a, b) ? 'Crown won! Play again any time.' : 'Beat them both to win a crown.') + '</div>' +
        (ok ? '' : '<div class="lockbadge">' + ico('lock') + ' Unlock both creatures first</div>') + '</div>';
    }).join('');
    var n = OPPONENTS.filter(function (o, i) { return oppOpen(i); }).length;
    return '<h3 class="tierh">👑 Three at the table <span style="font-weight:600;opacity:.7;font-size:14px">(you against two · ' + crowns() + '/' + list().length + ' crowns)</span></h3><div class="opps">' + cards +
      (n >= 2 ? '<div class="opp mode" data-act="trioPick"><span class="avatar lg" style="background:#e5dbff;color:#5f3dc4;font-size:46px">' + ico('people') + '</span><h3>Pick any two</h3><div class="otitle">Choose two creatures you have unlocked</div></div>' : '') + '</div>';
  }
  var sel = [];
  function pickHTML() {
    var chips = OPPONENTS.map(function (o, i) {
      if (!oppOpen(i)) return '';
      var on = sel.indexOf(i) >= 0;
      return '<button class="btn small' + (on ? ' green' : '') + '" style="margin:4px" data-act="trioToggle" data-arg="' + i + '">' + esc(o.name) + (on ? ' ✔' : '') + '</button>';
    }).join('');
    return '<h2>👑 Pick two creatures</h2><div style="text-align:center">' + chips + '</div><div class="row" style="margin-top:14px"><button class="btn green" data-act="trioGo"' + (sel.length === 2 ? '' : ' disabled style="opacity:.5"') + '>Play!</button><button class="btn" data-act="closeModal">Back</button></div>';
  }
  ACT.playTrio = function (el) { var p = el.dataset.arg.split('-'); startMatch('ai3', null, { a: +p[0], b: +p[1] }); };
  ACT.lockedTrio = function () { Snd.boop(); modal('<h2>' + ico('lock') + ' Not yet!</h2><p style="text-align:center">Unlock both of these creatures in one-on-one games first. Then you can take them on together!</p><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>'); };
  ACT.trioPick = function () { sel = []; modal(pickHTML()); };
  ACT.trioToggle = function (el) { var i = +el.dataset.arg, k = sel.indexOf(i); if (k >= 0) sel.splice(k, 1); else { if (sel.length === 2) sel.shift(); sel.push(i); } Snd.click(); $('#modalBox').innerHTML = pickHTML(); };
  ACT.trioGo = function () { if (sel.length !== 2) return; var a = Math.min(sel[0], sel[1]), b = Math.max(sel[0], sel[1]); closeModal(); startMatch('ai3', null, { a: a, b: b }); };
  // Called from endMatch (mode 'ai3'). soleWin: the kid finished alone in first place.
  function onMatchEnd(soleWin) {
    if (!G || !G.cfg) return;
    S.stats.bestMatch = Math.max(S.stats.bestMatch || 0, G.players[0].score);
    if (soleWin) {
      S.trios = S.trios || {};
      var k = key(G.cfg.a, G.cfg.b), first = !S.trios[k], isSet = list().some(function (p) { return key(p[0], p[1]) === k; });
      S.trios[k] = true;
      addXP(first ? 80 : 25, first ? (isSet ? '👑 Crown won: beat ' : 'Beat ') + OPPONENTS[G.cfg.a].name + ' and ' + OPPONENTS[G.cfg.b].name + ' together!' : 'Won against two creatures');
    }
    persist();
  }
  return { list: list, won: won, crowns: crowns, setupHTML: setupHTML, onMatchEnd: onMatchEnd };
})();
