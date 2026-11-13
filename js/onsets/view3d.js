'use strict';
// ======================= ON-SETS IN 3D: THE MATCH SCREEN AND THE TABLE =======================
// Glue between the On-Sets match (OG, js/onsets/game.js) and the shared 3D world (js/three/table.js, creatures.js,
// player.js) plus the On-Sets pieces in js/three/onsets3d.js. Loaded by js/onsets/game.js (no index.html edit).
// The match is drawn on the #game screen with the same layout as an Equations match (#gTop scores, #gGoal, #gMat
// = the 3D table, #gAct = Pip's line + buttons; a right-hand column on wide windows, all from css/style.css), so
// the look-around camera, the photo button, speech bubbles, the stadium, crowd and weather all work as they do there.
// While On-Sets is on: T3.tableLayouts(OS_LAYOUTS) paints the On-Sets zones, T3.handlers points at On-Sets, and the
// cubes the table draws are the On-Sets kinds (T3.cubeKind). OS3D.end() puts all of that back for Equations.
var OS3D = (function () {
  // Table units (a cube is 1). Zones: [x, z, w, d], x across, z toward the seat camera. Room for 12 cards, a Goal of up
  // to three cubes (stacked = multiply), the three sections and 18 cubes.
  var OS_LAYOUTS = {
    wide: { W: 20, D: 15.6, tilt: 1.02, z: { universe: [-9.6, -7.5, 12.6, 5.6], goal: [3.4, -7.5, 6.2, 5.6], required: [-9.6, -1.6, 6.2, 3.9], permitted: [-3.1, -1.6, 6.2, 3.9], forbidden: [3.4, -1.6, 6.2, 3.9], resources: [-9.6, 2.6, 19.2, 4.9] } },
    tall: { W: 12, D: 19.6, tilt: 1.15, z: { universe: [-5.6, -9.4, 11.2, 5.8], goal: [-5.6, -3.3, 11.2, 2.9], required: [-5.6, -0.1, 3.6, 4.4], permitted: [-1.8, -0.1, 3.6, 4.4], forbidden: [2.0, -0.1, 3.6, 4.4], resources: [-5.6, 4.6, 11.2, 5.0] } }
  };
  var OS_LABELS = {
    wide: { universe: '🃏 UNIVERSE', goal: '🎯 GOAL', required: '✅ REQUIRED · must use', permitted: '👍 PERMITTED · may use', forbidden: "⛔ FORBIDDEN · can't use", resources: '🎲 RESOURCES' },
    tall: { universe: '🃏 UNIVERSE', goal: '🎯 GOAL', required: '✅ REQUIRED', permitted: '👍 PERMITTED', forbidden: '⛔ FORBIDDEN', resources: '🎲 RESOURCES' }
  };
  var GOAL_LAY = { 'A': [[0, 0]], 'A+B': [[0, 0], [0, 1]], 'A+B+C': [[0, 0], [0, 1], [0, 2]], 'AxB': [[0, 0], [1, 0]], 'AxBxC': [[0, 0], [1, 0], [2, 0]], 'Ax(B+C)': [[0, 0.5], [1, 0], [1, 1]], 'AxB+C': [[0, 0], [1, 0], [1, 1]] };
  var on = false, saved = null, keep = false, seatFlip = false; // keep: the last shake's cubes stay on the table until the next roll sweeps them into the cup
  function T() { return window.T3; }
  function can() {
    var t = T();
    try { return !!(t && t.supported && t.active && t.active() && t.cubeKind && t.tableLayouts && t.onsets && t.onsets.ready && t.ctx && t.attach && t.pour); } catch (e) { return false; }
  }
  function grown() { return typeof S !== 'undefined' && S.set && S.set.me === 'tata'; }
  function mateIdx() { if (!OG) return -1; if ((OG.mode === 'pvp' || OG.mode === 'p3') && !OG.players[1].ai) return 1; return -1; }
  // CLOCKWISE (mirrors G.seatFlip / aiSeat in js/game.js): with two creatures on a wide table the first one to play stands on the
  // kid's left, which is creature seat 1 there. osSeat(i) (game.js) counts creatures in play order; seatOf() gives the figure's seat.
  function flipSeat(n) { return seatFlip && n < 2 ? 1 - n : n; }
  function seatOf(i) { return flipSeat(osSeat(i)); }
  // who rolls (picks up the cup and dumps it) = the Goal-setter: 'me' (the kid), 'mate' (Tata), a creature's seat, or null (today's tipping pour)
  function rollerBy() {
    var t = T(), s = OG ? OG.setter : -1;
    if (!OG || s < 0) return null;
    if (osIsAI(s)) return t.creatureMove ? seatOf(s) : null;
    if (s === 0) return t.playerMove && S.set.avatar !== false ? 'me' : null;
    if (s === mateIdx()) return t.mateMove ? 'mate' : null;
    return null;
  }

  // ---- what the table shows: OG -> the object T3.sync reads ----
  function goalSlots() {
    var t = T(), L = t.ctx.layout, r = L && L.z.goal, out = {};
    // the three white V / Λ cubes sit together on their own little plate at the end of Resources
    var rs = t.onsets && t.onsets.restrSlots ? t.onsets.restrSlots() : [];
    OG.cubes.filter(function (c) { return c.kind === 'restr' && c.zone === 'resources'; }).forEach(function (c, k) { if (rs[k]) out[c.id] = rs[k]; });
    if (!r || !OG.goal) return out;
    var lay = GOAL_LAY[OG.goal.shape] || GOAL_LAY.A, rows = 1, cols = 1;
    lay.forEach(function (p) { rows = Math.max(rows, p[0] + 1); cols = Math.max(cols, Math.ceil(p[1] + 1)); });
    var a = { x: r[0] + 0.25, z: r[1] + 1.05, w: r[2] - 0.5, d: r[3] - 1.25 }, cx = a.x + a.w / 2, cz = a.z + a.d / 2;
    OG.goal.digits.forEach(function (d, k) {
      var p = lay[k] || [0, k], c = OG.cubes[d.id];
      if (!c || c.zone !== 'goal') return;
      // side by side = add; stacked = multiply (a cube really stands on the one below it); upside down = negative
      out[d.id] = { x: cx + (p[1] - (cols - 1) / 2) * 1.06, z: cz, scale: 1, y: 0.5 + (rows - 1 - p[0]) * 1.0, turn: c.neg ? Math.PI : 0 };
    });
    return out;
  }
  function payload() {
    return {
      cubes: OG.cubes.map(function (c) { return { id: c.id, color: c.color, s: c.s, zone: c.zone, order: c.order, locked: false }; }),
      goalTokens: [], selected: OG.selected, highlight: OG.highlight, phase: OG.phase, slots: goalSlots(), onsets: true
    };
  }
  function render() {
    if (!on || !OG || !OG.cubes || !OG.universe) return;
    var t = T(), el = $('#game');
    if (!el.classList.contains('os3d') || !$('#gTop')) el.innerHTML = '<div id="gTop" class="game-top"></div><div id="gGoal"></div><div id="gMat"></div><div id="gAct" class="actionbar"></div>';
    el.classList.add('three', 'os3d');
    $('#gTop').innerHTML = osTopHTML();
    var n = OG.universe.length;
    $('#gGoal').innerHTML = n ? '<div class="goalhud os-ghud"><div class="gl">' + ico('target') + '<span>GOAL</span></div>' +
      (OG.goal && OG.goalValue != null ? '<span class="expr os-gexpr">' + OSUI.goalPicHTML(OG.goal, true) + '</span><span class="gv">= ' + OG.goalValue + ' card' + (OG.goalValue === 1 ? '' : 's') + '</span>' : '<span class="gv os-gwait">' + (OG.phase === 'goal' ? 'being set…' : '…') + '</span>') +
      '<span class="os-ucount" title="Cards in the Universe">🃏 ' + n + '</span></div>' : '';
    t.attach($('#gMat')); if (!keep) t.sync(payload()); // (keep: last shake's cubes stay put until the cup takes them)
    $('#gAct').innerHTML = osSpeechHTML() + '<div class="acts">' + osActionsHTML() + '</div>';
  }

  // ---- taps and drags on the 3D table (T3.handlers is swapped while On-Sets is on) ----
  var handlers = {
    canDrag: function (id) { var c = OG && OG.cubes[id]; return !!c && osHumanTurn() && c.zone === 'resources' && c.kind !== 'digit'; },
    dragStart: function (id) { if (!OG) return; OG.selected = id; osLitFor(id); },
    cubeTap: function (id) {
      var c = OG && OG.cubes[id]; if (!c) return;
      if (c.zone === 'resources') { ACT.osCube({ dataset: { arg: String(id) } }); return; }
      if (OG.carrying) { finishCarry(); return; }
      if (OG.selected != null && osHumanTurn() && ['required', 'permitted', 'forbidden'].indexOf(c.zone) >= 0) osTryMove(OG.selected, c.zone, false);
    },
    zoneTap: function (z) {
      if (!OG) return;
      if (OG.carrying) { finishCarry(); return; }
      if (OG.selected != null && osHumanTurn()) osTryMove(OG.selected, z, false);
    },
    drop: function (id, z) {
      if (!OG) return;
      if (z && ['required', 'permitted', 'forbidden'].indexOf(z) >= 0 && osHumanTurn() && osTryMove(id, z, true)) return;
      if (OG.cubes[id] && OG.cubes[id].zone === 'resources') { OG.selected = null; osLitFor(null); osRender(); }
    },
    targetZones: function () {
      if (!OG || OG.selected == null || OG.phase !== 'move') return [];
      return osCubes('resources').length > 1 ? ['required', 'permitted', 'forbidden'] : ['required', 'permitted'];
    }
  };

  // ---- the people and creatures at the table ----
  function seatPeople() {
    var t = T();
    if (t.playerShow) t.playerShow(S.set.avatar !== false);
    if (t.playerSet) t.playerSet({ who: grown() ? 'tata' : 'kid', name: grown() ? S.name : (typeof backName === 'function' ? backName() : S.name), number: S.jersey || '7' });
    var mi = mateIdx();
    if (t.mate) {
      if (mi === 1) t.mate({ who: grown() ? 'kid' : 'tata', seat: OG.mode === 'p3' ? 'left' : 'far', name: OG.players[1].name, number: grown() ? '7' : '17' });
      else t.mate(null);
    }
    var ais = OG.players.filter(function (p) { return p.ai; });
    var matEl = document.getElementById('gMat'), mw = (matEl && matEl.clientWidth) || innerWidth, mh = (matEl && matEl.clientHeight) || innerHeight;
    seatFlip = ais.length === 2 && !(mw / Math.max(1, mh) < 0.9); // the same wide / tall test as js/game.js and js/three/table.js chooseLayout
    if (ais.length > 1 && t.setCreatures) { var seatList = ais.map(function (p) { return { kind: p.ai.kind, pack: p.ai.pack || 'classic' }; }); if (seatFlip) seatList.reverse(); t.setCreatures(seatList); }
    else if (t.setCreature) t.setCreature(ais.length ? ais[0].ai.kind : null, ais.length ? (ais[0].ai.pack || 'classic') : 'classic');
    if (t.playerWalkSide) t.playerWalkSide(OG.mode === 'ai3' ? 'right' : 'auto'); // the second creature stands at the far left corner
  }
  function creaturesEnter() {
    var t = T(); if (!t.creatureEnter) return;
    if (!(t.creatureCount && t.creatureCount() > 1)) { t.creatureEnter(); return; }
    t.creatureWith(0, function () { t.creatureEnter(); });
    setTimeout(function () { if (on && t.creatureWith) t.creatureWith(1, function () { t.creatureEnter(); }); }, 450);
  }
  function begin() {
    var t = T();
    on = true; keep = false;
    saved = t.handlers; t.handlers = handlers;
    t.tableLayouts({ layouts: OS_LAYOUTS, labels: OS_LABELS, zcol: { universe: '#ffe8a3' } });
    t.onsets.enter();
    hideCubes();
    var wx = t.matchWeather ? t.matchWeather() : null;
    if (typeof go === 'function') go('game');
    var el = $('#game'); el.innerHTML = ''; el.classList.add('three', 'os3d');
    seatPeople();
    if (t.cue) t.cue('reset');
    if (t.setBoard) t.setBoard('ON-SETS');
    var stadium = ['stadium', 'night'].indexOf(S.cos.mat) >= 0;
    if (Snd.ambience) Snd.ambience(['stadium', 'night', 'beach', 'volcano'].indexOf(S.cos.mat) >= 0 ? 'stadium' : 'room');
    if (window.WeatherSfx) WeatherSfx.set(stadium && wx ? wx.ambience : 'off');
    var first = osAI(); if (first && Snd.theme) Snd.theme(first.kind);
    creaturesEnter();
    setTimeout(function () { if (on && t.playerMood) t.playerMood('wave'); }, 500);
    render();
  }
  function end() {
    if (!on) return;
    var t = T();
    on = false; keep = false;
    if (t.onsets) t.onsets.exit();
    if (saved) t.handlers = saved; saved = null;
    t.tableLayouts(null);
    if (t.mate) t.mate(null);
    if (t.setBoard) t.setBoard('');
    if (t.playerMoveFinish) try { t.playerMoveFinish(); } catch (e) {}
    hideCubes(); t.lastG = null;
    if (window.Social && Social.clearBubbles) Social.clearBubbles();
    if (window.WeatherSfx) WeatherSfx.set('off');
    if (Snd.ambience) Snd.ambience('off');
    var el = document.getElementById('game'); if (el) { el.innerHTML = ''; el.classList.remove('os3d', 'three'); }
  }
  function hideCubes() { var t = T(); try { t.ctx.meshes.forEach(function (m) { m.visible = false; m.userData.tpos = null; m.userData.zone = null; }); t.ctx.dirty(); } catch (e) {} }

  // ---- a shake: roll (the physics pour), set out the white cubes, deal the cards ----
  function sideOf(i) {
    if (i === 0) return 'near';
    if (osIsAI(i)) return 'far';
    if (i === mateIdx()) return OG.mode === 'p3' ? 'left' : 'far';
    return 'right';
  }
  function rollAndDeal(dealer, done) {
    var t = T(), g0 = OG, c0 = OG.cubes;
    var rolled = OG.cubes.filter(function (c) { return c.kind !== 'restr'; });
    render(); // (keep is still on: the last shake's cubes lie where they were, and the cup takes them first)
    var by = rollerBy(); // the Goal-setter picks the cup up and dumps it (a creature, the kid or Tata); null = the cup just tips
    t.pour(rolled.map(function (c) { return { id: c.id, color: c.color, s: c.s }; }), function (res) {
      keep = false;
      if (OG !== g0 || OG.cubes !== c0) return;
      // the faces that came up are the roll (colour and operation cubes: 4 symbols on 6 faces, two layouts at random,
      // so each symbol still has a 1 in 4 chance; digit cubes are real 1 1 2 3 4 5 cubes)
      rolled.forEach(function (c) { if (res && res[c.id] != null) c.s = res[c.id]; });
      // the Goal-setter's three white cubes are set out (not rolled) on their own little plate at the end of Resources: they drop in one after another
      try {
        var rs = t.onsets.restrSlots();
        OG.cubes.filter(function (c) { return c.kind === 'restr'; }).forEach(function (c, k) { var m = t.ctx.meshes[c.id]; if (!m || !rs[k]) return; m.position.set(rs[k].x, 2.2 + k * 0.9, rs[k].z); m.userData.dropped = true; });
        t.onsets.tray(true);
      } catch (e) {}
      render();
      setTimeout(function () {
        if (OG !== g0 || OG.cubes !== c0) return;
        t.onsets.deal(OG.universe, sideOf(dealer), function () { if (OG === g0 && OG.cubes === c0) { render(); done(); } });
      }, 350);
    }, by != null ? { by: by } : undefined);
  }

  // ---- hands: who carries a cube over (a creature reaches, the kid or the mate walks round and places it) ----
  function canCarry(who) {
    var t = T(); if (!OG) return false;
    if (osIsAI(who)) return !!t.creatureMove;
    if (who === 0) return !!t.playerMove && S.set.avatar !== false;
    if (who === mateIdx()) return !!t.mateMove;
    return false;
  }
  function carry(who, id, zone, done, opts) {
    var t = T();
    if (!canCarry(who)) { done(); return; }
    if (osIsAI(who)) { if (t.creatureUse) t.creatureUse(seatOf(who)); t.creatureMove(id, zone, done); return; }
    (who === 0 ? t.playerMove : t.mateMove)(id, zone, done, opts && opts.quick ? { quick: true } : undefined);
  }
  function finishCarry() { var t = T(); if (OG && OG.carrying && t.playerMoveFinish) { OG.skipCarry = OG.phase === 'goal'; t.playerMoveFinish(); } }

  // ---- moods, talk, camera moments, crowd ----
  var PERSON = { challenge: 'now', now: 'now', think: 'think', happy: 'cheer', gloat: 'cheer', dance: 'cheer', cheer: 'cheer', sad: 'aw', cry: 'aw', aw: 'aw', nod: 'nod', clap: 'clap', gasp: 'think', nervous: 'think', shrug: 'aw', wave: 'wave', tantrum: 'aw' };
  function mood(i, m) {
    var t = T();
    if (osIsAI(i)) { if (t.creatureWith && t.creatureMood) t.creatureWith(seatOf(i), function () { t.creatureMood(m); }); return; }
    var pm = PERSON[m] || m;
    if (i === 0 && t.playerMood) t.playerMood(pm);
    else if (i === mateIdx() && t.mateMood) t.mateMood(pm);
  }
  function crowd(kind) { try { if (typeof crowdReact === 'function') crowdReact(kind); else if (T().crowd) T().crowd(kind); } catch (e) {} }
  function challenge(kind, who, mover) {
    var t = T();
    var close = (osIsAI(who) || osIsAI(mover)) && t.shot && t.shot('challenge');
    if (!close && t.cue) t.cue('challenge');
    if (t.fx) t.fx('shake');
    if (t.setBoard) t.setBoard(kind === 'now' ? 'NOW!' : 'IMPOSSIBLE!');
    crowd('gasp');
    if (who === 0 && t.playerMood) t.playerMood('now', { kind: kind });
  }
  function goalSet(v) {
    var t = T();
    if (t.setBoard) t.setBoard('GOAL' + String.fromCharCode(10) + v + (v === 1 ? ' CARD' : ' CARDS'));
    try { // the Goal's sewn label on the felt ("2 × 3 = 6") and the brass frame warming once
      if (t.onsets && t.onsets.goal && OG && OG.goal) { var ex = OSE.goalText(OG.goal); t.onsets.goal((ex === String(v) ? '' : ex + ' ') + '= ' + v); }
      if (t._craft) t._craft('plinth');
    } catch (e) {}
    if (t.shot) t.shot('goal');
    crowd('cheer');
  }
  function matchEnd(winners) {
    var t = T(), kidWon = winners.length === 1 && winners[0] === 0;
    if (kidWon) { if (t.playerCelebrate) t.playerCelebrate(typeof Kit !== 'undefined' && Kit.celebration ? Kit.celebration() : undefined); if (t.fx) { t.fx('confetti'); t.fx('wave'); } crowd('cheer'); if (t.setBoard) t.setBoard('WINNER!'); }
    else if (t.playerMood) t.playerMood(winners.indexOf(0) >= 0 ? 'clap' : 'aw');
    osAIs().forEach(function (i) { mood(i, winners.indexOf(i) >= 0 ? (winners.length === 1 ? 'dance' : 'happy') : 'sad'); });
    if (mateIdx() === 1) mood(1, winners.indexOf(1) >= 0 ? 'cheer' : 'clap');
    if (!(t.shot && t.shot(kidWon ? 'win' : 'lose')) && t.cue) t.cue(kidWon ? 'win' : 'lose');
  }
  // the forming replay of one Solution: its cards rise step by step, then the count shows by the Goal
  function form(rp, goal, done) {
    var t = T(); if (!t.onsets || !t.onsets.form) return false;
    var steps = OSE.formSteps(rp.tokens, OG.universe);
    if (!steps) { var ev = OSE.evaluate(rp.tokens, OG.universe); if (!ev.ok || ev.ambiguous) return false; steps = [{ set: ev.set, count: ev.count, text: OSE.exprText(rp.tokens) }]; }
    var n = steps[steps.length - 1].count, ok = n === goal;
    var final = ok ? n + ' card' + (n === 1 ? '' : 's') + ' = the Goal ' + goal + '!' : n + ' card' + (n === 1 ? '' : 's') + ' · the Goal is ' + goal;
    if (rp.sample) final = 'One way: ' + final;
    return t.onsets.form(steps, { final: final, ok: ok }, done);
  }

  return {
    LAYOUTS: OS_LAYOUTS,
    can: can, begin: begin, end: end, active: function () { return on; }, render: render,
    // a new shake: the cards flip back into their deck and the Goal label goes; the cubes stay where they lie until the roll, when the cup sweeps them in
    newShake: function () {
      var t = T(); keep = true;
      if (t.onsets) { if (t.onsets.goal) t.onsets.goal(null); if (t.onsets.tray) t.onsets.tray(false); if (t.onsets.tidy) t.onsets.tidy(); else t.onsets.clear(); }
      if (t.cue) t.cue('reset'); if (t.setBoard) t.setBoard('ON-SETS');
    },
    rollAndDeal: rollAndDeal, canCarry: canCarry, carry: carry, finishCarry: finishCarry,
    use: function (seat) { var t = T(); if (t.creatureUse) t.creatureUse(flipSeat(seat)); }, // seat = osSeat(i) (game.js); the figure's seat may be mirrored
    talk: function (ms) { var t = T(); if (t.creatureTalk) t.creatureTalk(ms); },
    mood: mood, kid: function (m) { var t = T(); if (t.playerMood) t.playerMood(m); }, crowd: crowd,
    challenge: challenge, goalSet: goalSet, matchEnd: matchEnd,
    highlight: function (mask, label) { var t = T(); if (on && t.onsets) t.onsets.highlight(mask, label); },
    form: form
  };
})();
