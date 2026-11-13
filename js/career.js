'use strict';
// ======================= CAREER =======================
// Two things live here:
//
// 1. SIGNATURE RULES ("bosses that bring their own special rules"). Each Legend League creature (opponents 11-15 in
//    js/config.js) has o.sig, and so do the two older league bosses (Mondo, King Messy: light = only on shakes where
//    they set the Goal). A signature is built ONLY from rules the engine already has:
//      {kind:'card', card, set?}   that variation card is in force on every shake (js/variations.js Vari.apply)
//      {kind:'shuffle'}            a different variation card every shake (Queen Chroma)
//      {kind:'bonus', die}         that bonus die ('big' | 'power') rolls with the cubes every shake (js/bonus.js)
//    Playing a boss is a way to MEET a rule early: the signature works whether or not he has unlocked that card or die
//    himself, and meeting it does not unlock it (the ladder still unlocks cards and dice with skill points).
//    Tata's Parent-corner switches always win: a card he switched off (or variation cards switched off altogether),
//    or a die he switched off, means the creature plays with normal rules, and the announcement says so kindly.
//    Signatures play only in one-on-one matches against that creature (mode 'ai', which includes Cup rounds).
//    Hooks (snippets in docs/handoff/career.md):
//      startMatch      -> Career.announce(oppIdx, go)   one screen before the match: the rule + "Practice first"
//                      -> Career.matchStart(G)          remembers the signature for this match
//      newShake        -> Career.onShake(G, fixed)      after Bonus.onShake: adds the creature's bonus die
//      startGoalPhase  -> Career.beforeGoal(again)      after Bonus.beforeGoal, before Vari.beforeGoal: deals the card
//      renderSetup     -> Career.tagHTML(i)             a small tag on the opponent card
//
// 2. THE CAREER OVERVIEW: three leagues as a path, every creature a stop (beaten / open / locked), the boss at the end
//    of each league, crowns and season pennants per league, and what unlocks next. Career.open() shows it in a
//    pop-up; Career.html() is the same as a section to place anywhere; Career.buttonHTML() opens it.
//    Career.bossLineHTML(idx, first) is a line for the match-end pop-up when a league boss is beaten.
var Career = (function () {
  var LG_ID = ['c', 'm', 'l'], LG_ICON = ['⚽', '👹', '🌟'];
  function opps() { return typeof OPPONENTS !== 'undefined' ? OPPONENTS : []; }
  function opp(i) { return opps()[i] || null; }
  function E(s) { return typeof esc === 'function' ? esc(s) : String(s); }
  function I(n) { return typeof ico === 'function' ? ico(n) : ''; }
  function snd(n) { try { if (typeof Snd !== 'undefined' && Snd && typeof Snd[n] === 'function') Snd[n](); } catch (e) {} }
  function save() { if (typeof persist === 'function') persist(); }
  function per() { return typeof LEAGUE !== 'undefined' ? LEAGUE : 5; }
  function nLeagues() { return Math.floor(opps().length / per()); }
  function lgName(L) { return (typeof LEAGUE_NAMES !== 'undefined' && LEAGUE_NAMES[L]) || ['Classic League', 'Monster League', 'Legend League'][L] || 'League'; }
  function beaten(i) { return !!(typeof S !== 'undefined' && S.beaten && S.beaten[i]); }
  function isOpen(i) { return typeof oppOpen === 'function' ? oppOpen(i) : true; }
  function store() { if (typeof S === 'undefined') return { seen: {} }; if (!S.career || typeof S.career !== 'object') S.career = { seen: {} }; if (!S.career.seen) S.career.seen = {}; return S.career; }
  function face(o, cls) { return typeof avatarHTML === 'function' ? avatarHTML(o, cls) : '<span class="avatar ' + (cls || '') + '">' + o.emoji + '</span>'; }

  // ---------- the rule each signature brings ----------
  function sig(i) { var o = opp(i); return o && o.sig || null; }
  function variOn() { return typeof Vari !== 'undefined' && !!(typeof S !== 'undefined' && S.set && S.set.variations !== false); }
  function cardOk(id) { return variOn() && !!Vari.card(id) && Vari.cardOn(id); }
  function dieOk(d) {
    if (typeof Bonus === 'undefined' || !Bonus.DIE[d]) return false;
    var b = Bonus.store(); if (b.off[d]) return false;
    return d !== 'power' || Eq.POWER_FACES.some(function (s) { return Bonus.opOn(s); });
  }
  function pool() { return variOn() ? Vari.CARDS.filter(function (c) { return Vari.cardOn(c.id); }).map(function (c) { return c.id; }) : []; }
  function earnedCard(id) { return typeof Vari !== 'undefined' && Vari.unlocked().some(function (c) { return c.id === id; }); }
  // Everything the screens need to know about creature i's rule, right now.
  //   {i, s, kind, name, icon, rule, short, ok, why, earned, lesson:{act, arg}}   (null: no signature)
  function info(i) {
    var s = sig(i), o = opp(i); if (!s || !o) return null;
    var r = { i: i, s: s, kind: s.kind, light: !!s.light, ok: false, why: '', earned: false, lesson: null };
    if (s.kind === 'card') {
      var c = typeof Vari !== 'undefined' ? Vari.card(s.card) : null;
      r.name = c ? Vari.cardName(s.card, s.set || {}) : s.card; r.icon = c ? c.icon : '🃏';
      r.rule = c ? (s.card === 'basem' && s.set ? 'Count in ' + (s.set.base === 8 ? 'eights' : 'nines') + '! Every number is read in base ' + s.set.base + ', and two cubes side by side can make a two-digit number in a Solution.' : c.rule) : '';
      r.ok = cardOk(s.card); r.earned = earnedCard(s.card);
      r.why = r.ok ? '' : !variOn() ? 'Variation cards are switched off in the Parent corner' : 'Tata switched the ' + r.name + ' card off in the Parent corner';
      r.lesson = { act: 'variLesson', arg: s.card };
    } else if (s.kind === 'shuffle') {
      r.name = 'A new card every shake'; r.icon = '🎴';
      r.rule = 'Every shake, ' + o.name + ' deals a different variation card, and it is in force for that shake. You will see each card (and how it works) when it is dealt.';
      r.ok = pool().length > 0; r.earned = typeof Vari !== 'undefined' && Vari.unlockedCount() >= Vari.CARDS.length;
      r.why = r.ok ? '' : !variOn() ? 'Variation cards are switched off in the Parent corner' : 'All variation cards are switched off in the Parent corner';
      r.lesson = null;
    } else if (s.kind === 'bonus') {
      var d = typeof Bonus !== 'undefined' ? Bonus.DIE[s.die] : null;
      r.name = d ? 'The ' + d.name : s.die; r.icon = d ? d.icon : '🎲';
      r.rule = d ? d.rule : '';
      r.ok = dieOk(s.die); r.earned = typeof Bonus !== 'undefined' && Bonus.unlocked(s.die);
      r.why = r.ok ? '' : 'Tata switched the ' + (d ? d.name : 'bonus die') + ' off in the Parent corner';
      r.lesson = { act: 'bonusLesson', arg: s.die };
    }
    r.short = r.icon + ' ' + r.name;
    return r;
  }

  // ---------- before the match: one screen ----------
  // Returns true if it showed the screen (go() runs when he taps "Let's play!"), false if there is nothing to say.
  function announce(i, go) {
    var r = info(i), o = opp(i);
    if (!r || typeof modal !== 'function') return false;
    var st = store(), first = !st.seen[o.id]; st.seen[o.id] = 1; save();
    var head = r.light ? o.name + '\'s favourite card' : o.name + '\'s special rule';
    var body;
    if (!r.ok) body = '<p class="car-small">' + E(o.name) + ' usually plays with <b>' + E(r.short) + '</b>. ' + E(r.why) + ', so today it is a match with the normal rules. Have fun!</p>';
    else {
      var card = r.kind === 'card' && typeof Vari !== 'undefined' && Vari.cardHTML ? '<div class="vari-cards one">' + Vari.cardHTML(Vari.card(r.s.card), false, false, r.s.set || null) + '</div>' : '<div class="car-rule"><span class="car-ricon">' + r.icon + '</span><div><b>' + E(r.name) + '</b><p>' + E(r.rule) + '</p></div></div>';
      var when = r.light ? 'Whenever ' + E(o.name) + ' sets the Goal, this card is in force for that shake.' : r.kind === 'bonus' ? 'It rolls with the cubes on every shake of this match, for both of you.' : r.kind === 'shuffle' ? '' : 'It is in force on every shake of this match, for both of you.';
      var meet = r.earned ? 'You already know this one. Show ' + E(o.name) + ' what you can do!' : 'You haven\'t unlocked this yet, so here is a sneak peek! It stays ' + E(o.name) + '\'s rule until you earn it yourself with skill points.';
      body = card + (when ? '<p class="car-small">' + when + '</p>' : '') + '<p class="car-small">' + meet + '</p>';
    }
    var practice = r.ok && r.lesson ? '<button class="btn" data-act="careerPractice" data-arg="' + i + '">' + I('cap') + ' Practice first</button>' : '';
    var again = function () { if (go) go(); };
    modal('<h2 class="hero">' + (first ? '✨ ' : '') + E(head) + '</h2>' +
      '<div class="row car-who">' + face(o, 'lg') + '<div class="bubble">' + E(sayLine(o, r)) + '</div></div>' + body +
      '<div class="row">' + practice + '<button class="btn green big" data-act="careerGo">' + I('play') + ' Let\'s play!</button></div>', null);
    pendingGo = again;
    return true;
  }
  var pendingGo = null;
  function sayLine(o, r) {
    if (!r.ok) return 'Hello! No special rule today. Let\'s play!';
    var L = { bleep: 'Bleep! In my matches you may use every sign again and again. Repeat after me!', flip: 'Hi! In my matches you can turn a number upside-down: 3 becomes −3. The world looks better that way!', squiggle: 'Blub! Eight arms, so I count in eights. In my matches, 10 means eight!', nugget: 'Welcome to my cave! My golden Power die rolls with the cubes. Use it if you can!', chroma: 'Welcome to my court! Every shake, I deal a new card. Can you keep up?', wizard: 'Behold! When I set the Goal, two cubes may join into a big number. Like my 99!', zog: 'When the King sets the Goal, every Solution needs three signs. Royal math!' };
    return L[o.id] || ('My rule: ' + r.name + '!');
  }

  // ---------- during the match ----------
  function matchStart(g) {
    if (!g) return;
    g.sig = null;
    if (g.mode !== 'ai' || g.oppIdx == null || !sig(g.oppIdx)) return;
    g.sig = { idx: g.oppIdx, s: sig(g.oppIdx), used: [], dealt: 0 };
  }
  // after Bonus.onShake: the creature's bonus die joins the roll (if the kid's own die did not already bring it)
  function onShake(g, fixed) {
    if (!g || !g.sig || fixed || g.sig.s.kind !== 'bonus') return;
    var d = g.sig.s.die;
    if (!dieOk(d) || g.cubes.some(function (c) { return c.color === d; })) return;
    var faces = Eq.CUBE_FACES[d].filter(function (f) { return Bonus.okFace(d, f); });
    if (!faces.length) return;
    g.cubes.push({ id: g.cubes.length, color: d, s: faces[Math.floor(Math.random() * faces.length)], zone: 'resources', order: g.cubes.length, locked: false });
  }
  // at the start of the Goal phase: deal the signature card. Returns true if it took over (again() runs after).
  function beforeGoal(again) {
    var g = typeof G !== 'undefined' ? G : null;
    if (!g || !g.sig || g.sigDone === g.cubes) return false;
    g.sigDone = g.cubes;                                         // once per shake (the cube list is new every shake)
    var s = g.sig.s, o = opp(g.sig.idx), setter = g.players[g.setter];
    if (s.kind !== 'card' && s.kind !== 'shuffle') return false;
    if (s.light && !(setter && setter.ai === o)) return false;     // light: only when it sets the Goal
    if (g.variDone || g.vari) return false;                        // the Twist die already picked this shake's card
    var id = null, set = null;
    if (s.kind === 'card') {
      if (!cardOk(s.card)) return false;
      if (!Vari.hasEffect(s.card)) { if (typeof say === 'function') say('pip', 'No ' + E(Vari.cardName(s.card, s.set || {})) + ' this shake: with these cubes it couldn\'t change anything.', 'think'); return false; }
      id = s.card; set = s.set || null;
    } else {
      var can = pool().filter(function (c) { return Vari.hasEffect(c); });
      if (!can.length) return false;
      var fresh = can.filter(function (c) { return g.sig.used.indexOf(c) < 0; });
      var list = fresh.length ? fresh : can;
      id = list[Math.floor(Math.random() * list.length)];
    }
    Vari.apply(id, set); g.variDone = true; g.sig.used.push(id); g.sig.dealt++;
    var c = Vari.card(id), name = Vari.cardName(id);
    snd('pop');
    // a rule that is on every shake was explained before the match: from then on the card chip and one line are enough
    if (s.kind === 'card' && !s.light) { if (typeof say === 'function') say('opp', g.sig.dealt > 1 ? c.icon + ' ' + E(name) + ' again: my rule!' : 'My rule is on: <b>' + c.icon + ' ' + E(name) + '</b>!'); return false; }
    var lesson = c.lesson ? '<button class="btn" data-act="variLesson" data-arg="' + id + '">How it works</button>' : '';
    var title = s.kind === 'shuffle' ? E(o.name) + ' deals a new card' : s.light ? E(o.name) + ' plays a favourite card' : E(o.name) + '\'s rule is on';
    if (typeof say === 'function') say('opp', 'This shake: <b>' + c.icon + ' ' + E(name) + '</b>!');
    modal('<h2>' + title + '</h2><div class="vari-cards one">' + Vari.cardHTML(c, false, false, g.variSet) + '</div>' +
      '<p class="vari-small">' + (s.kind === 'shuffle' ? 'This card is for this shake only. Next shake, a new one!' : s.light ? 'For this shake, because ' + E(o.name) + ' set the Goal.' : 'In force on every shake of this match.') + '</p>' +
      '<div class="row">' + lesson + '<button class="btn green big" data-act="closeModal">Got it!</button></div>', function () { if (typeof G !== 'undefined' && G === g) again(); });
    return true;
  }
  function tagHTML(i) {
    var r = info(i); if (!r) return '';
    return '<div class="car-tag' + (r.ok ? '' : ' off') + '" title="' + E(r.rule) + '">' + (r.light ? 'Favourite card: ' : 'Special rule: ') + E(r.short) + (r.ok ? '' : ' (switched off)') + '</div>';
  }

  // ---------- the Career overview ----------
  function seasonInfo(L) {
    if (typeof Season === 'undefined' || !Season.state) return null;
    var lg = LG_ID[L], st = Season.state(); if (!st[lg]) return null;
    var pens = Season.pennants().filter(function (p) { return p.lg === lg; });
    var gold = pens.filter(function (p) { return p.kind === 'gold'; }).length;
    var place = Season._core ? Season._core.placeOf(st[lg], 0) : null;
    return { n: st[lg].n, k: st[lg].k, place: place, pens: pens.length, gold: gold };
  }
  function crownsIn(L) {
    if (typeof Trio === 'undefined' || !Trio.list) return { won: 0, all: 0 };
    var p = per(), l = Trio.list().filter(function (x) { return Math.floor(x[0] / p) === L && Math.floor(x[1] / p) === L; });
    return { won: l.filter(function (x) { return Trio.won(x[0], x[1]); }).length, all: l.length };
  }
  function next() {
    for (var i = 0; i < opps().length; i++) if (isOpen(i) && !beaten(i)) return i;
    return -1;
  }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function stopHTML(i) {
    var o = opp(i), won = beaten(i), open = isOpen(i), boss = (i + 1) % per() === 0, r = info(i);
    var state = won ? 'won' : open ? 'open' : 'lock';
    var act = open ? ' data-act="careerPlay" data-arg="' + i + '"' : ' data-act="careerLocked" data-arg="' + i + '"';
    return '<button type="button" class="car-stop ' + state + (boss ? ' boss' : '') + '"' + act + ' aria-label="' + E(o.name + (won ? ', beaten' : open ? ', ready to play' : ', locked')) + '">' +
      '<span class="car-face">' + face(o, boss ? 'lg' : '') + (won ? '<i class="car-mark">' + (boss ? '👑' : '★') + '</i>' : !open ? '<i class="car-mark lk">' + I('lock') + '</i>' : '') + '</span>' +
      '<b>' + E(o.name) + '</b>' + (r && !r.light ? '<small class="car-sig">' + E(r.icon) + '</small>' : boss ? '<small class="car-sig">BOSS</small>' : '') + '</button>';
  }
  function leagueHTML(L) {
    var p = per(), first = L * p, n = 0, i;
    for (i = first; i < first + p; i++) if (beaten(i)) n++;
    var bossWon = beaten(first + p - 1), si = seasonInfo(L), cr = crownsIn(L);
    var stops = ''; for (i = first; i < first + p; i++) stops += (i > first ? '<i class="car-link' + (beaten(i - 1) ? ' on' : '') + '"></i>' : '') + stopHTML(i);
    var meta = '<span>' + n + ' / ' + p + ' beaten</span>' + (cr.all ? '<span>👑 ' + cr.won + ' / ' + cr.all + ' crowns</span>' : '') +
      (si ? '<span>🚩 ' + si.pens + ' pennant' + (si.pens === 1 ? '' : 's') + (si.gold ? ' (' + si.gold + ' gold)' : '') + '</span><span>Season ' + si.n + ': ' + (si.k ? ord(si.place) : 'not started') + '</span>' : '');
    return '<div class="car-league' + (bossWon ? ' done' : '') + '"><div class="car-lhead"><span class="car-licon">' + LG_ICON[L] + '</span><b>' + E(lgName(L)) + '</b>' + (bossWon ? '<span class="car-champ">' + I('trophy') + ' Conquered!</span>' : '') + '</div>' +
      '<div class="car-path">' + stops + '</div><div class="car-meta">' + meta + '</div></div>';
  }
  function html() {
    var nl = nLeagues(), total = nl * per(), won = 0, i;
    for (i = 0; i < total; i++) if (beaten(i)) won++;
    var nx = next(), nxo = nx >= 0 ? opp(nx) : null, r = nx >= 0 ? info(nx) : null;
    var leagues = ''; for (var L = 0; L < nl; L++) leagues += leagueHTML(L);
    var nextLine = nxo ? '<div class="car-next">' + face(nxo, '') + '<div><small>Next stop</small><b>' + E(nxo.name) + ' ' + E(nxo.title) + '</b>' + (r && r.ok ? '<small>' + (r.light ? 'Favourite card: ' : 'Special rule: ') + E(r.short) + '</small>' : '') + '</div><button class="btn green small" data-act="careerPlay" data-arg="' + nx + '">' + I('play') + ' Play</button></div>'
      : '<div class="car-next all">🏆 <b>Every creature beaten! You are a Legend.</b></div>';
    var cups = (typeof Cup !== 'undefined' && Cup.CUPS) ? Cup.CUPS.filter(function (c) { return Cup.state().won[c.id]; }).length + ' / ' + Cup.CUPS.length : null;
    return '<div class="car">' +
      '<div class="car-top"><div class="car-big">' + won + '<small>/ ' + total + '</small></div><div><b>creatures beaten</b>' + (cups ? '<small>' + I('trophy') + ' Cups: ' + cups + '</small>' : '') + '</div></div>' +
      nextLine + leagues +
      '<p class="car-small">Each league opens with its first creature. Beat a creature to open the next one. The boss at the end of each league is the toughest, and the Legend League bosses bring their own special rules. Nothing you win can ever be lost.</p></div>';
  }
  function open() {
    if (typeof modal !== 'function') return;
    modal('<h2>' + I('trophy') + ' My Career</h2>' + html() + '<div class="row"><button class="btn green" data-act="closeModal">OK</button></div>');
  }
  function buttonHTML(cls) { return '<button class="btn ' + (cls || 'big blue') + '" data-act="career">' + I('trophy') + ' Career</button>'; }
  // A line for the match-end pop-up when a league boss was just beaten (first time): the celebration in words.
  function bossLineHTML(idx, first) {
    if (idx == null || (idx + 1) % per() !== 0 || !beaten(idx)) return '';
    var L = Math.floor(idx / per()), nextL = L + 1 < nLeagues() ? L + 1 : -1;
    var txt = first ? '🏆 <b>' + E(lgName(L)) + ' conquered!</b> You beat its boss, ' + E(opp(idx).name) + '!' + (nextL >= 0 ? ' The <b>' + E(lgName(nextL)) + '</b> is waiting for you.' : ' You beat the final boss of the whole game. Legend!')
      : '👑 You beat the ' + E(lgName(L)) + ' boss again!';
    return '<div class="car-line">' + txt + ' <button class="btn small" data-act="career">' + I('trophy') + ' Career</button></div>';
  }

  if (typeof ACT !== 'undefined') {
    ACT.career = function () { snd('click'); open(); };
    ACT.careerGo = function () { var f = pendingGo; pendingGo = null; if (typeof closeModal === 'function') closeModal(); if (f) f(); };
    ACT.careerPractice = function (el) {
      var i = +el.dataset.arg, r = info(i); if (!r || !r.lesson) return;
      var back = function () { var g = pendingGo; announce(i, g); };
      var body = r.lesson.act === 'variLesson' ? Vari.lessonHTML(r.lesson.arg) : Bonus.lessonHTML(r.lesson.arg);
      snd('click');
      modal(body + '<div class="row"><button class="btn green" data-act="closeModal">Back to ' + E(opp(i).name) + '</button></div>', back);
    };
    ACT.careerPlay = function (el) { var i = +el.dataset.arg; if (typeof closeModal === 'function') closeModal(); if (typeof ACT.playOpp === 'function') ACT.playOpp({ dataset: { arg: String(i) } }); };
    ACT.careerLocked = function (el) {
      var i = +el.dataset.arg, o = opp(i), prev = opp(i - 1); snd('boop');
      var back = function () { open(); };
      modal('<h2>' + I('lock') + ' Not yet!</h2><p style="text-align:center">Win a match against <b>' + E(prev ? prev.name : '?') + '</b> to open <b>' + E(o.name) + '</b>.</p><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>', back);
    };
  }
  return { info: info, sig: sig, announce: announce, matchStart: matchStart, onShake: onShake, beforeGoal: beforeGoal, tagHTML: tagHTML,
    html: html, open: open, buttonHTML: buttonHTML, bossLineHTML: bossLineHTML, next: next };
})();
