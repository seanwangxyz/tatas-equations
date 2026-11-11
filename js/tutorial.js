'use strict';
// ======================= TUTORIAL =======================
var TUT = null;
// A fixed practice roll (each symbol is a real face of that color's cube)
var TUT_FACES = { red: ['3', '+', '1', '2', '0', '-'], blue: ['2', '*', '0', '1', '3', '/'], green: ['4', '5', '6', '-', '*', '4'], black: ['7', '9', '8', '+', '/', '8'] };
function startTutorial() {
  var cubes = [], id = 0;
  Eq.COLORS.forEach(function (c) { TUT_FACES[c].forEach(function (s) { cubes.push({ id: id++, color: c, s: s }); }); });
  setCreature('pip');
  G = { mode: 'tutorial', shakes: 1, shake: 1, setter: 0, players: [{ name: S.name, ai: null, score: 0, list: [] }, { name: 'Pip', ai: PIP, score: 0, list: [] }], trailed: false };
  TUT = { step: 0 };
  go('game'); Snd.musicOff();
  var saveUnlock = S.unlockAll; S.unlockAll = false;
  var saveStage = S.ladder.stage; S.ladder.stage = 0;
  newShake(cubes);
  S.unlockAll = saveUnlock; S.ladder.stage = saveStage;
  say('pip', 'Hi! I\'m Pip! Let\'s play one practice shake together. First the cubes get rolled…', 'cheer');
  setTimeout(function () {
    TUT.step = 1;
    say('pip', 'These cubes are the <b>Resources</b>. 🔒 Locked cubes are operations you\'ll unlock later. You rolled, so YOU set the Goal. Tap <b>Build the Goal</b> and make the Goal <b>7</b>.');
    renderGame();
  }, 1700);
}
function tutGoalOK(tokens) {
  var ok = tokens.length === 1 && typeof tokens[0] === 'object' && tokens[0].s === '7';
  if (!ok) { Snd.boop(); $('#builderBox .b-live').innerHTML = 'For practice, let\'s make the Goal just <b>7</b>. Clear it, then tap the 7 cube.'; }
  return ok;
}
function tutAfterGoal() {
  TUT.step = 2;
  say('pip', 'The Goal is 7! 🎯 Now we take turns moving ONE cube from Resources. <b>Required</b> = must be used. <b>Permitted</b> = may be used. <b>Forbidden</b> = can\'t be used. My turn first!', 'cheer');
  renderGame();
  setTimeout(aiTurn, 1800);
}
function tutAiMove() {
  G.busy = false;
  var find = function (s) { return zoneCubes('resources').find(function (c) { return c.s === s; }); };
  if (TUT.step === 2) {
    var c9 = find('9'); TUT.step = 3;
    say('pip', 'I\'ll put the <b>9</b> in Forbidden. Now NOBODY can use it!');
    aiPlace(c9.id, 'forbidden', 1);
  } else if (TUT.step === 4) {
    var cp = find('+'); TUT.step = 5;
    say('pip', 'I\'ll put the <b>+</b> in Permitted. That means anyone MAY use it.');
    aiPlace(cp.id, 'permitted', 1);
  }
}
function tutPrompt() {
  if (TUT.step === 3) { var c3 = zoneCubes('resources').find(function (c) { return c.s === '3'; }); G.highlight = c3 && c3.id; say('pip', 'Your turn! Tap the glowing <b>3</b>, then tap <b>REQUIRED</b>. Required cubes MUST be used in any Solution.'); }
  if (TUT.step === 5) { var c4 = zoneCubes('resources').find(function (c) { return c.s === '4'; }); G.highlight = c4 && c4.id; say('pip', 'Look! <b>3 + 4 = 7</b>! The 4 is still in Resources, and <b>Now!</b> lets you use ONE more cube from Resources. Tap <b>⚡ Now!</b>', 'cheer'); }
}
function tutAllowMove(c, zone) {
  if (TUT.step === 3 && c.s === '3' && zone === 'required') { TUT.step = 4; return true; }
  Snd.boop();
  say('pip', TUT.step === 5 ? 'This time, don\'t move a cube. Tap <b>⚡ Now!</b>' : 'For practice, move the <b>3</b> to <b>Required</b>.', 'think');
  return false;
}
function tutAllowChallenge(kind) {
  if (TUT.step === 5 && kind === 'now') return true;
  Snd.boop();
  say('pip', kind === 'impossible' ? 'Not this time! <b>Impossible!</b> is for when NOBODY can make the Goal. But 7 can be made!' : 'Not yet. Let\'s move the 3 first!', 'think');
  return false;
}
function tutAfterSolution(ok, tokens, chk) {
  if (ok) {
    S.tutorialDone = true; xpLog = []; addXP(30, 'Finished the tutorial!'); checkBadges({ type: 'tutorial' }); persist();
    Snd.chime(); victoryFX();
    modal('<h2>🎉 You did it!</h2><div class="row">' + pipHTML('cheer', 90, 'cheer') + '<div class="bubble">3 + 4 = 7. A correct <b>Now!</b> challenge scores <b>6</b> points!</div></div>' +
      '<p><b>Remember:</b></p><ul class="reasons" style="background:#e7f5ff"><li>On your turn: move ONE cube, or challenge.</li><li><b>⚡ Now!</b> = "I can make the Goal right now, with at most one more Resource cube."</li><li><b>🚫 Impossible!</b> = "Nobody can EVER make the Goal with these cubes."</li><li>When one cube is left, it goes to Required or Permitted, then everybody writes a Solution.</li><li>Correct = 6 (or 4 after the last cube). Not correct = 2. Everybody always scores something!</li></ul>' +
      '<div class="row"><button class="btn green big" data-act="closeModal">Let\'s play! ▶</button></div>', function () { G = null; TUT = null; drainQueue(function () { renderSetup(); go('setup'); }); });
  } else {
    Snd.boop();
    var why = chk && chk.reasons ? chk.reasons : ['No Solution yet.'];
    modal('<h2>🤔 Almost!</h2><ul class="reasons">' + why.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul><p style="text-align:center">Try building <b>3 + 4</b>: tap the 3, then the +, then the 4.</p><div class="row"><button class="btn green" data-act="closeModal">Try again</button></div>',
      function () { openSolutionBuilder(0, 'now', function () {}); });
  }
}
