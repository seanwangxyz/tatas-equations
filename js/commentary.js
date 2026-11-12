'use strict';
// ======================= THE COMMENTATOR (classic script) =======================
// One short line on the big moments of a match, in a small "commentary box" caption near the top of the screen,
// and read aloud when 'Read lines aloud' is on (S.set.voice === true). Off with S.set.commentary === false.
//
//   Commentary.say(event, data) -> the line shown, or '' when it stayed quiet. Never throws.
//     'kickoff'    {kid, opp}                      the match starts
//     'goal'       {goal, by, cubes}               a Goal is set (cubes: how many cubes it uses)
//     'clever'     {by}                            a clever move
//     'challenge'  {kind: 'now'|'impossible', by}  someone challenges
//     'solution'   {by}                            a correct Solution
//     'nearly'     {by}                            a Solution that wasn't correct (always encouraging)
//     'comeback'   {kid}                           the kid was behind and is now in front
//     'matchpoint' {kid}                           the last shake starts
//     'final'      {won, tie, kid}                 the final whistle
//     'shake'      {r}                             convenience for endShake(r): picks comeback, solution or nearly
//   Names left out are filled in from the game (S.name, the opponent). data.force: skip the rate limit.
//   Commentary.hide()   take the caption away now (e.g. leaving the match)
//   Commentary.LINES    the lines, by event
//
// House rules (the owner's): never shame a wrong answer; at most one line about every 6 seconds; the spoken line
// never talks over Pip (it waits for Pip to finish, and is dropped if Pip keeps talking); no real commentators'
// names or catchphrases. No line is used twice in a row for the same moment.
var Commentary = (function () {
  var GAP = 6000, SHOW_MS = 4300;
  var LINES = {
    kickoff: [
      'And we\'re under way! {kid} against {opp}!',
      'The cubes are in the cup... and we\'re off!',
      'What a night for maths! {kid} versus {opp}. Let\'s go!',
      'Kick-off! The crowd is buzzing for this one.',
      'Here we go! Two big brains, one Goal to chase.',
      'Welcome, everybody! {kid} takes on {opp} tonight.',
      'The whistle blows and the cubes are rolling!',
      'A full stadium tonight, and they\'ve all come for the maths!',
      '{opp} looks ready. {kid} looks ready. Let\'s play!',
      'Lovely evening for numbers. We\'re under way!'
    ],
    goal: [
      'A bold Goal: {goal}!',
      '{by} sets the Goal at {goal}. Ooh, interesting!',
      'There it is on the big screen: {goal}!',
      'The Goal is {goal}. Who can build it?',
      '{goal}! That\'s the target. Game on!',
      '{by} goes for {goal}. Clever choice!',
      'Up on the scoreboard: {goal}. The crowd likes it!',
      'A Goal of {goal}! Now the real thinking starts.',
      '{goal} it is! Plenty to think about here.',
      'And the Goal is... {goal}!'
    ],
    goalBig: [
      'Look at that! {cubes} cubes in one Goal: {goal}!',
      'A big build from {by}! The Goal is {goal}.',
      'What a Goal! {goal}, made from {cubes} cubes!',
      '{by} has built a monster Goal: {goal}!',
      'Ooh, a fancy one! {goal} on the big screen.',
      'That\'s a proper puzzle of a Goal: {goal}!',
      '{cubes} cubes up there! {goal} is the target.',
      'The crowd goes ooh! A Goal of {goal}!'
    ],
    clever: [
      'Ooh, sneaky move from {by}!',
      '{by} is thinking a few moves ahead there.',
      'Now that\'s a clever little move.',
      'Did you see that? Lovely placement from {by}.',
      'Tricky! {by} is setting a puzzle.',
      'That cube went exactly where {by} wanted it.',
      'A crafty move! The crowd goes ooh.',
      'Smart thinking from {by}. Watch this space!',
      '{by} likes that one. You can tell!'
    ],
    now: [
      '{by} is calling NOW!',
      'NOW! {by} thinks there\'s a Solution right there!',
      'Here comes the challenge! {by} says NOW!',
      'Ooh, {by} has spotted something. NOW!',
      '{by} shouts NOW! Can it be done?',
      'A NOW! call from {by}! Big moment!',
      'The crowd holds its breath... {by} calls NOW!',
      'Bold! {by} says it can be solved right now!',
      'NOW! says {by}. Pencils ready!'
    ],
    impossible: [
      'IMPOSSIBLE! says {by}. Is it, though?',
      '{by} thinks nobody can make that Goal!',
      'An Impossible! call from {by}. Drama!',
      '{by} says it can\'t be done. Let\'s find out!',
      'Big call! {by} goes for Impossible!',
      'The stadium goes quiet. {by} calls IMPOSSIBLE!',
      'Impossible? {by} seems very sure!',
      'Here\'s a brave one: Impossible! from {by}.'
    ],
    solution: [
      'GOAL! What a Solution from {by}!',
      'It adds up! {by} nails it!',
      'That Solution is perfect! Every cube in its place!',
      'Lovely maths from {by}!',
      'And it works! The crowd is on its feet!',
      '{by} makes it look easy!',
      'Brilliant! That\'s how you build a Solution!',
      'Pure class from {by}. It equals the Goal!',
      'What a finish! {by} gets it exactly right!',
      'Yes! {by} cracks it!',
      'Spot on! That Solution is a beauty.',
      'Superb! {by} puts it all together!'
    ],
    nearly: [
      'So close! That was a brave try from {by}.',
      'Not this time, but what a go from {by}!',
      'Great effort! {by} will get the next one.',
      'Nearly! Every try makes the brain stronger.',
      'Unlucky! That was really good thinking.',
      'A bold attempt! The crowd loves the spirit.',
      'Not quite, but {by} is learning fast!',
      'Good try! The best players miss sometimes too.',
      'Ooh, almost! Keep going, {by}!',
      'That\'s the way to have a go! On to the next shake!'
    ],
    comeback: [
      'What a comeback! {kid} is in front now!',
      '{kid} was behind, and now look! Out in front!',
      'Never give up! {kid} turns it around!',
      'The comeback is on! The crowd can\'t believe it!',
      'From behind to in front! Brilliant from {kid}!',
      '{kid} fights back and takes the lead!',
      'Who said it was over? {kid} is flying now!',
      'A turnaround! {kid} leads the way!',
      'Big comeback! The fans are singing {kid}\'s name!'
    ],
    matchpoint: [
      'Last shake of the match! Everything to play for!',
      'Here we go, the final shake. Big moment!',
      'This is it, the last shake! Who will win it?',
      'Final shake! The crowd is on the edge of their seats.',
      'One more shake to go. Deep breaths, everybody!',
      'Last chance for points! Let\'s see some magic.',
      'The final shake is coming up. What a match this has been!',
      'It all comes down to this last shake!'
    ],
    finalWin: [
      'And there\'s the final whistle! {kid} wins!',
      'Full time! What a performance from {kid}!',
      'It\'s all over! {kid} takes the match!',
      'Peep, peep, peep! Victory for {kid}!',
      'The match is won! Take a bow, {kid}!',
      'Full time, and the whole crowd is cheering for {kid}!',
      'That\'s the whistle! A brilliant win for {kid}!',
      'What a match! {kid} is the winner tonight!'
    ],
    finalOther: [
      'Full time! What a match, everybody!',
      'There\'s the whistle. Great game from both sides!',
      'It\'s all over! Lots of brilliant maths tonight.',
      'Full time! {kid} played with real heart.',
      'The final whistle! What a battle that was.',
      'That\'s the match! {kid} will be back even stronger.',
      'Full time! The crowd enjoyed every minute.',
      'And that\'s that! A cracking game of Equations.'
    ],
    finalTie: [
      'Full time, and it\'s a tie! Nothing between them!',
      'The final whistle! Level scores. What a contest!',
      'All square at full time! Both sides were brilliant.',
      'It\'s a tie! The crowd wants a rematch!',
      'Full time! You couldn\'t split them tonight!',
      'Level at the whistle! What a game of Equations.',
      'A tie! Brilliant maths from everybody.',
      'Full time, all even! Who\'s up for another?'
    ]
  };
  var lastAt = -1e9, lastIdx = {}, hideT = null, el = null, txt = null, sayAt = -1e9, speakTok = 0;

  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function on() { return setg().commentary !== false; }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function inMatch() {
    try { return typeof G !== 'undefined' && !!G && G.mode !== 'tutorial' && (typeof current === 'undefined' || current === 'game'); } catch (e) { return false; }
  }
  function kidName() { try { return (typeof S !== 'undefined' && S.name) ? S.name : 'our player'; } catch (e) { return 'our player'; } }
  function oppName() {
    try {
      if (typeof G === 'undefined' || !G || !G.players) return 'the opposition';
      var o = G.players.slice(1).map(function (p) { return p.name; });
      return o.length > 1 ? o.slice(0, -1).join(', ') + ' and ' + o[o.length - 1] : (o[0] || 'the opposition');
    } catch (e) { return 'the opposition'; }
  }
  function strip(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\''); }
  function pickLine(key) {
    var a = LINES[key]; if (!a || !a.length) return '';
    var i = Math.floor(Math.random() * a.length);
    if (a.length > 1 && i === lastIdx[key]) i = (i + 1 + Math.floor(Math.random() * (a.length - 1))) % a.length;
    lastIdx[key] = i; return a[i];
  }
  function fill(line, d) {
    return line.replace(/\{(\w+)\}/g, function (m, k) { var v = d[k]; return strip(v == null ? '' : v); });
  }

  // ---- the caption ----
  function ensure() {
    if (el && document.body.contains(el)) return true;
    if (typeof document === 'undefined' || !document.body) return false;
    el = document.createElement('div'); el.id = 'wh-comm'; el.className = 'wh-comm'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="wh-comm-mic" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span><b class="wh-comm-tag">LIVE</b><span class="wh-comm-txt"></span>';
    txt = el.querySelector('.wh-comm-txt');
    document.body.appendChild(el);
    return true;
  }
  function show(line) {
    if (!ensure()) return;
    txt.textContent = line;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');   // (re)start the one-shot slide-in
    clearTimeout(hideT); hideT = setTimeout(hide, SHOW_MS);
  }
  function hide() { clearTimeout(hideT); hideT = null; if (el) el.classList.remove('on'); }

  // ---- speaking (only with 'Read lines aloud'), never over Pip ----
  // say() in js/game.js is watched (wrapped once) so we know when Pip or a creature last started a line.
  function watchSay() {
    try {
      var f = window.say; if (typeof f !== 'function' || f.__wh) return;
      var w = function () { sayAt = now(); return f.apply(this, arguments); };
      w.__wh = true; window.say = w;
    } catch (e) {}
  }
  function busySpeaking() {
    try { var ss = window.speechSynthesis; return !!(ss && (ss.speaking || ss.pending)); } catch (e) { return false; }
  }
  function speak(line) {
    if (setg().voice !== true || typeof Snd === 'undefined' || !Snd.speak) return;
    var tok = ++speakTok, t0 = now();
    (function tryNow() {
      if (tok !== speakTok || !inMatch()) return;
      var quiet = now() - sayAt > 1200 && !busySpeaking();
      if (quiet) { try { Snd.speak(line, 'owl'); } catch (e) {} return; }   // a calm, lower voice ("owl")
      if (now() - t0 < 4500) setTimeout(tryNow, 350);                         // Pip is talking: wait, or let it go
    })();
  }

  // 'shake' -> the most notable thing about a finished shake
  function fromShake(d) {
    var r = d.r || {}, sols = r.sols || {}, kid = kidName();
    try {
      // comeback: the kid was behind before this shake and is now alone in front
      var sc = G.players.map(function (p) { return p.score; }), pts = r.pts || {};
      var before = sc.map(function (s, i) { return s - (pts[i] || 0); });
      var bestOther = function (arr) { return Math.max.apply(null, arr.slice(1)); };
      if (G.players.length > 1 && !(G.players[0].ai) && before[0] < bestOther(before) && sc[0] > bestOther(sc)) return { ev: 'comeback', data: { kid: kid } };
    } catch (e) {}
    var keys = Object.keys(sols), i, k;
    for (i = 0; i < keys.length; i++) { k = keys[i]; if (+k === 0 && sols[k] && sols[k].ok) return { ev: 'solution', data: { by: nameOf(0) } }; }
    for (i = 0; i < keys.length; i++) { k = keys[i]; if (sols[k] && sols[k].ok) return { ev: 'solution', data: { by: nameOf(+k) } }; }
    for (i = 0; i < keys.length; i++) { k = keys[i]; if (sols[k] && sols[k].tokens && !sols[k].ok) return { ev: 'nearly', data: { by: nameOf(+k) } }; }
    return null;
  }
  function nameOf(i) { try { return (G.team && i === 0 && typeof Team !== 'undefined' && Team.yourName) ? strip(G.players[0].name) : strip(G.players[i].name); } catch (e) { return ''; } }

  function say(event, data) {
    try {
      data = data || {};
      if (!on() || !inMatch()) return '';
      watchSay();
      if (event === 'shake') { var p = fromShake(data); if (!p) return ''; p.data.force = data.force; event = p.ev; data = p.data; }
      var key = event, d = {};
      Object.keys(data).forEach(function (k) { d[k] = data[k]; });
      if (d.kid == null) d.kid = kidName();
      if (d.opp == null) d.opp = oppName();
      if (d.by == null) d.by = d.kid;
      if (event === 'goal') { if (d.goal == null && G.goal) d.goal = Eq.fmt(G.goal); if ((d.cubes || 0) >= 4) key = 'goalBig'; }
      else if (event === 'challenge') key = d.kind === 'impossible' ? 'impossible' : 'now';
      else if (event === 'final') key = d.won ? 'finalWin' : d.tie ? 'finalTie' : 'finalOther';
      if (!LINES[key]) return '';
      var t = now(), gap = (event === 'final' || d.force) ? 2500 : GAP;
      if (t - lastAt < gap) return '';
      var line = fill(pickLine(key), d);
      if (!line) return '';
      lastAt = t;
      show(line); speak(line);
      return line;
    } catch (e) { return ''; }
  }
  watchSay();
  return { say: say, hide: function () { speakTok++; hide(); }, LINES: LINES, _reset: function () { lastAt = -1e9; } };
})();
