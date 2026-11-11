'use strict';
// ======================= PROGRESS: stages, XP, badges =======================
function stageIdx() { return S.unlockAll ? STAGES.length - 1 : Math.min(S.ladder.stage, STAGES.length - 1); }
function stageInfo() { return STAGES[stageIdx()]; }
var xpLog = [];
var celebrateQ = [];
function addXP(n, why) {
  if (n <= 0) return;
  var before = level(); S.xp += n; xpLog.push('+' + n + ' XP · ' + why);
  var after = level();
  if (after > before) { celebrateQ.push({ type: 'level', level: after }); checkBadges({ type: 'level' }); }
  persist();
}
function addStar() {
  if (S.unlockAll || S.ladder.stage >= STAGES.length - 1) return;
  S.ladder.stars++;
  if (S.ladder.stars >= STAGES[S.ladder.stage].need) {
    S.ladder.stage++; S.ladder.stars = 0;
    celebrateQ.push({ type: 'unlock', stage: S.ladder.stage });
    checkBadges({ type: 'stage' });
  }
  persist();
}

var BADGES = [
  // bronze
  { id: 'first', tier: 'bronze', icon: '🎉', name: 'First Solution!', hint: 'Write your first correct Solution.', test: function (e) { return S.stats.correct >= 1; } },
  { id: 'tutorial', tier: 'bronze', icon: '🎓', name: "Pip's Student", hint: 'Finish the How to Play tutorial.', test: function (e) { return S.tutorialDone; } },
  { id: 'now', tier: 'bronze', icon: '⚡', name: 'Now You See It', hint: 'Call Now! and write a correct Solution.', test: function (e) { return e.type === 'challenge' && e.kind === 'now' && e.won; } },
  { id: 'goal10', tier: 'bronze', icon: '🎯', name: 'Goal Getter', hint: 'Set 10 Goals.', test: function () { return S.stats.goalsSet >= 10; } },
  { id: 'times', tier: 'bronze', icon: '✖️', name: 'Times Traveler', hint: 'Use × in a correct Solution.', test: function () { return (S.opsUsed['*'] || 0) >= 1; } },
  { id: 'divide', tier: 'bronze', icon: '➗', name: 'Divide & Conquer', hint: 'Use ÷ in a correct Solution.', test: function () { return (S.opsUsed['/'] || 0) >= 1; } },
  { id: 'zero', tier: 'bronze', icon: '0️⃣', name: 'Zero Hero', hint: 'Use a 0 cube in a correct Solution.', test: function (e) { return e.type === 'solution' && e.hasZero; } },
  { id: 'daily1', tier: 'bronze', icon: '📅', name: 'Daily Doer', hint: 'Solve a Daily Puzzle.', test: function () { return S.stats.daily >= 1; } },
  { id: 'beat0', tier: 'bronze', icon: '🦥', name: 'Sloth Waker', hint: 'Win a match against the Sleepy Sloth.', test: function () { return S.beaten[0]; } },
  { id: 'bounce', tier: 'bronze', icon: '🌈', name: 'Bounce Back', hint: 'Get one wrong, then get the next one right.', test: function (e) { return e.type === 'solution' && e.bounce; } },
  { id: 'big', tier: 'bronze', icon: '🏗️', name: 'Big Builder', hint: 'Write a correct Solution with 5 or more cubes.', test: function (e) { return e.type === 'solution' && e.cubes >= 5; } },
  { id: 'patient', tier: 'bronze', icon: '🐢', name: 'Patient Thinker', hint: 'Keep thinking for over 2 minutes and solve it anyway!', test: function (e) { return e.type === 'solution' && e.ms > 120000; } },
  { id: 'sport', tier: 'bronze', icon: '🤝', name: 'Good Sport', hint: 'Play 10 shakes in 2-player mode.', test: function () { return S.stats.pvpShakes >= 10; } },
  // silver
  { id: 'imp', tier: 'silver', icon: '🔍', name: 'Impossible Detective', hint: 'Call Impossible! when nobody can make the Goal.', test: function (e) { return e.type === 'challenge' && e.kind === 'impossible' && e.won; } },
  { id: 'defend', tier: 'silver', icon: '🛡️', name: 'Not Impossible!', hint: 'Someone says Impossible! and you prove them wrong.', test: function (e) { return e.type === 'solution' && e.mode === 'impossible'; } },
  { id: 'streak', tier: 'silver', icon: '🔥', name: 'Hot Streak', hint: 'Write 3 correct Solutions in a row.', test: function () { return S.stats.streak >= 3; } },
  { id: 'ten', tier: 'silver', icon: '🔟', name: 'Ten Solutions', hint: 'Write 10 correct Solutions.', test: function () { return S.stats.correct >= 10; } },
  { id: 'nohint', tier: 'silver', icon: '🧠', name: 'All By Myself', hint: 'Play 5 shakes in a row without a hint.', test: function () { return S.stats.noHint >= 5; } },
  { id: 'power', tier: 'silver', icon: '🚀', name: 'Power Up', hint: 'Use ^ in a correct Solution.', test: function () { return (S.opsUsed['^'] || 0) >= 1; } },
  { id: 'root', tier: 'silver', icon: '🌱', name: 'Root Explorer', hint: 'Use √ in a correct Solution.', test: function () { return (S.opsUsed.r || 0) >= 1; } },
  { id: 'frac1', tier: 'silver', icon: '🍕', name: 'Fraction Friend', hint: 'Make a fraction somewhere in a correct Solution.', test: function () { return S.stats.fractionSolutions >= 1; } },
  { id: 'bigGoal', tier: 'silver', icon: '🏔️', name: 'Big Goal', hint: 'Solve a Goal of 50 or more.', test: function (e) { return e.type === 'solution' && e.goalAbs >= 50; } },
  { id: 'last', tier: 'silver', icon: '🧊', name: 'Last Cube Hero', hint: 'Write a correct Solution after the last cube is played.', test: function (e) { return e.type === 'solution' && e.mode === 'last'; } },
  { id: 'beat1', tier: 'silver', icon: '🐧', name: 'Penguin Pal', hint: 'Win a match against the Puzzle Penguin.', test: function () { return S.beaten[1]; } },
  { id: 'beat2', tier: 'silver', icon: '🦊', name: 'Beat the Fox', hint: 'Win a match against the Clever Fox.', test: function () { return S.beaten[2]; } },
  { id: 'comeback', tier: 'silver', icon: '💪', name: 'Comeback Kid', hint: 'Be behind in a match, then win it.', test: function (e) { return e.type === 'match' && e.won && e.trailed; } },
  { id: 'lvl5', tier: 'silver', icon: '⭐', name: 'Level 5', hint: 'Reach Level 5.', test: function () { return level() >= 5; } },
  // gold
  { id: 'all4', tier: 'gold', icon: '🧮', name: 'Used All 4 Operations', hint: 'Use +, −, × and ÷ in ONE correct Solution.', test: function (e) { return e.type === 'solution' && ['+', '-', '*', '/'].every(function (o) { return e.ops.indexOf(o) >= 0; }); } },
  { id: 'mega', tier: 'gold', icon: '🏰', name: 'Mega Builder', hint: 'Write a correct Solution with 7 or more cubes.', test: function (e) { return e.type === 'solution' && e.cubes >= 7; } },
  { id: 'fracM', tier: 'gold', icon: '🥧', name: 'Fraction Master', hint: 'Use fractions in 5 correct Solutions.', test: function () { return S.stats.fractionSolutions >= 5; } },
  { id: 'giant', tier: 'gold', icon: '🗻', name: 'Giant Goal', hint: 'Solve a Goal of 100 or more.', test: function (e) { return e.type === 'solution' && e.goalAbs >= 100; } },
  { id: 'fifty', tier: 'gold', icon: '🏅', name: 'Equation Machine', hint: 'Write 50 correct Solutions.', test: function () { return S.stats.correct >= 50; } },
  { id: 'beat3', tier: 'gold', icon: '🦉', name: 'Wiser Than an Owl', hint: 'Win a match against the Wise Owl.', test: function () { return S.beaten[3]; } },
  { id: 'beat4', tier: 'gold', icon: '🧙', name: 'Wizard Tamer', hint: 'Win a match against the Math Wizard.', test: function () { return S.beaten[4]; } },
  { id: 'perfect', tier: 'gold', icon: '💯', name: 'Perfect Match', hint: 'Win a match where you were correct on every shake.', test: function (e) { return e.type === 'match' && e.won && e.perfect; } },
  { id: 'daily12', tier: 'gold', icon: '🗓️', name: 'Daily Dozen', hint: 'Solve 12 Daily Puzzles (any days you like).', test: function () { return S.stats.daily >= 12; } },
  { id: 'lvl10', tier: 'gold', icon: '🌟', name: 'Level 10', hint: 'Reach Level 10.', test: function () { return level() >= 10; } },
  { id: 'allops', tier: 'gold', icon: '🔓', name: 'Every Operation', hint: 'Unlock every operation on the ladder.', test: function () { return S.ladder.stage >= STAGES.length - 1; } },
  // special
  { id: 'tata', tier: 'special', icon: '👑', name: "Beat Tata's Record", hint: 'Score ' + TATA_RECORD + ' or more points in one match against the computer.', test: function () { return S.stats.bestMatch >= TATA_RECORD; } }
];
function checkBadges(e) {
  e = e || {};
  BADGES.forEach(function (b) {
    if (S.badges[b.id]) return;
    var got = false; try { got = b.test(e); } catch (x) { got = false; }
    if (got) { S.badges[b.id] = today(); toastBadge(b); addXP(b.tier === 'gold' ? 50 : b.tier === 'special' ? 100 : b.tier === 'silver' ? 30 : 15, 'Badge: ' + b.name); }
  });
  persist();
}
function toastBadge(b) {
  var t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = medalHTML(b, true) + '<div><small>NEW BADGE!</small>' + esc(b.name) + '</div>';
  $('#toasts').appendChild(t);
  Snd.fanfare(); FX.burst(innerWidth - 80, 50, 50);
  setTimeout(function () { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; }, 3600);
  setTimeout(function () { t.remove(); }, 4200);
}

// ----- Modal helpers -----
var modalOnClose = null;
function modal(html, onClose) { $('#modalBox').innerHTML = html; $('#modal').classList.add('on'); modalOnClose = onClose || null; }
function closeModal() { $('#modal').classList.remove('on'); var f = modalOnClose; modalOnClose = null; if (f) f(); }
function drainQueue(done) {
  var it = celebrateQ.shift();
  if (!it) { if (done) done(); return; }
  if (it.type === 'level') {
    var unl = [].concat(SKINS.filter(function (x) { return x.lvl === it.level; }).map(function (x) { return x.name + ' cubes'; }),
      MATS.filter(function (x) { return x.lvl === it.level; }).map(function (x) { return x.name + ' mat'; }),
      VICTORIES.filter(function (x) { return x.lvl === it.level; }).map(function (x) { return x.name + ' victory'; }));
    Snd.fanfare(); victoryFX();
    modal('<h2>⬆️ LEVEL UP!</h2><div class="row">' + pipHTML('cheer', 100, 'cheer') + '<div class="bubble">You reached <b>Level ' + it.level + '</b>!</div></div>' +
      (unl.length ? '<p style="text-align:center">🎁 New unlock: <b>' + unl.join(', ') + '</b>! Pick it in the Trophy Room.</p>' : '') +
      '<div class="row"><button class="btn green" data-act="closeModal">Awesome!</button></div>', function () { drainQueue(done); });
  } else if (it.type === 'unlock') {
    showUnlock(it.stage, function () { drainQueue(done); });
  } else drainQueue(done);
}
function showUnlock(si, done) {
  var st = STAGES[si], lessons = UNLOCK_LESSONS[st.id] || [], k = 0, timer = null;
  Snd.fanfare(); FX.confetti(180);
  function slide() {
    var L = lessons[k];
    var ev = Eq.evaluate(L.e.split(''), { fractions: true });
    $('#modalBox').innerHTML = '<h2>' + st.icon + ' NEW: ' + st.name + '!</h2>' +
      '<div class="tut-slide"><div class="row">' + pipHTML(k % 2 ? 'happy' : 'cheer', 70, 'bob') + '<p style="flex:1;min-width:200px">' + L.t + '</p></div>' +
      exprBox(L.e.split('')) + (ev.ok ? '<p style="text-align:center;font-size:26px;font-weight:900">= ' + Eq.fmt(ev.value) + '</p>' : '') + '</div>' +
      '<div class="progress"><i id="tutProg"></i></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn" data-act="unlockNext">' + (k < lessons.length - 1 ? 'Next ▶' : 'Got it! 🎉') + '</button></div>';
    var p = $('#tutProg'); p.style.transition = 'none'; p.style.width = '0';
    requestAnimationFrame(function () { requestAnimationFrame(function () { p.style.transition = 'width 5s linear'; p.style.width = '100%'; }); });
    clearTimeout(timer); timer = setTimeout(next, 5000);
  }
  function next() { clearTimeout(timer); k++; if (k >= lessons.length) { closeModal(); } else { Snd.pop(); slide(); } }
  ACT.unlockNext = next;
  modal('', function () { clearTimeout(timer); done && done(); });
  if (lessons.length) slide(); else $('#modalBox').innerHTML = '<h2>Unlocked!</h2><button class="btn" data-act="closeModal">OK</button>';
}
