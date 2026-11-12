'use strict';
// ======================= ONLINE PLAY (two devices, one game) =======================
// Design (full write-up: docs/handoff/online.md):
//   - The HOST device is the referee. It runs the real game (G, js/game.js) exactly like a pass-and-play match
//     ('online' mode: player 0 = the host's player, player 1 = the guest's player).
//   - After every change the host publishes the whole game as one JSON string (rooms/CODE/state).
//   - The GUEST device never runs game rules. It turns the host's state into a "mirror" G seen from its own
//     seat (its player becomes player 0, so the table, HUD and 3D kid are "me"), and renders it with the normal
//     renderGame(). Its taps become small action messages (rooms/CODE/acts/N) that the host checks and applies.
//   - Whenever the game needs the guest's own private input (a Solution, a Goal for a "No Goal" challenge,
//     a variation card, "Impossible or write?" after the last cube, agreeing to "No Goal"), the host puts a
//     PROMPT for that seat into the state; the guest opens its builder/pop-up on its own device and sends the
//     answer back. Nothing the guest writes is shown until the host reveals the shake's results to both.
//   - Prompt ids are built from the game position, so after a host reload the same question gets the same id
//     and an answer that already arrived is used again. The host saves its game to localStorage at every publish.
//   - Nobody is ever timed out: a missing player gets a calm "lost connection: waiting…" banner.
//
// Hooks: js/game.js has three one-line changes (startMatch -> Online.setup, the jersey in renderGame, and
// 'online' counting as a 2-player shake in endShake). Everything else is wrapped from this file and every
// wrapper calls the original unchanged unless an online match is on (G.mode === 'online').
var Online = (function () {
  var WORDS = ['ANT', 'APE', 'BAT', 'BEAR', 'BEE', 'BIRD', 'BUG', 'CAT', 'COW', 'CRAB', 'DEER', 'DOG', 'DUCK', 'EEL', 'ELK', 'EMU', 'FISH', 'FOX', 'FROG',
    'GOAT', 'HEN', 'LION', 'MOLE', 'MOOSE', 'MOUSE', 'OWL', 'PIG', 'PONY', 'PUG', 'SEAL', 'SLOTH', 'SWAN', 'TIGER', 'TOAD', 'WOLF', 'YAK', 'ZEBRA',
    'APPLE', 'BALL', 'BOAT', 'CAKE', 'DRUM', 'KITE', 'LEMON', 'MANGO', 'MOON', 'PEAR', 'PLUM', 'ROCK', 'SHIP', 'SOCK', 'STAR', 'SUN', 'TACO',
    'TRAIN', 'TRUCK', 'PIZZA', 'ROBOT', 'CLOUD', 'RAIN'];
  var KEY = 'tataOnline.session' + (Net.test ? '.test.' + Net.profile : '');
  var ZONES = ['resources', 'goal', 'required', 'permitted', 'forbidden'];
  var O = null; // the live online session (null = not online)

  function on() { return !!(O && G && G.mode === 'online'); }
  function isHost() { return !!O && O.role === 'host'; }
  function isGuest() { return !!O && O.role === 'guest'; }
  function base() { return 'rooms/' + O.code; }
  function nm(i) { return G && G.players[i] ? esc(G.players[i].name) : 'your friend'; }
  function wait(i, what) { return 'Waiting for <b>' + nm(i) + '</b> to ' + what + '…'; }
  function prettyCode(c) { return c.replace(/^([A-Z]+)([0-9]+)$/, '$1 $2'); }
  function cleanName(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'Player'; }
  function cleanJersey(s) { return String(s == null ? '' : s).replace(/[^0-9]/g, '').slice(0, 2) || '7'; }
  function rid() { return Math.random().toString(36).slice(2, 10); }

  // ---------------------------------------------------------------- saving the session (survives a reload)
  function save() {
    if (!O) return;
    var s = { role: O.role, code: O.code, seat: O.seat, t: Date.now() };
    if (O.role === 'host') {
      s.guest = O.guest; s.answers = O.answers; s.ready = O.ready; s.result = O.result; s.resultN = O.resultN; s.over = O.over; s.emoteN = O.emoteN; s.seq = O.seq;
      s.stage = O.stage; s.hostReady = O.hostReady;
      if (G && G.mode === 'online') { s.g = JSON.stringify(G, skipKeys); s.oc = orderCounter; }
    } else { s.n = O.n; s.sent = O.sent; s.applied = O.applied; s.acked = O.acked; s.overShown = O.overShown; s.trailed = O.trailed; s.hint = O.hint; }
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function saved() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.code && Date.now() - (s.t || 0) < 24 * 3600 * 1000) return s; } catch (e) {} return null; }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function skipKeys(k, v) { return (k === 'speech' || k === 'aiPlan' || k === 'ai') ? undefined : v; }

  // ---------------------------------------------------------------- checking what arrives from the other device
  var SYMS = null;
  function symOK(s) { if (!SYMS) { SYMS = {}; '0123456789m'.split('').concat(Eq.OPS).forEach(function (x) { SYMS[x] = 1; }); } return typeof s === 'string' && SYMS[s] === 1; }
  function safeTokens(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 40).map(function (t) {
      if (t === '(' || t === ')') return t;
      if (t && typeof t === 'object' && symOK(t.s) && t.id === (t.id | 0) && t.id >= -1 && t.id < 24) return { s: t.s, id: t.id };
      return null;
    }).filter(function (t) { return t !== null; });
  }
  // Tokens the guest sent for a Goal or a Solution: every cube must be a real cube showing that symbol.
  function cubeTokens(list, kind) {
    if (!Array.isArray(list) || !list.length || list.length > 40) return null;
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t === '(' || t === ')') { out.push(t); continue; }
      if (!t || typeof t !== 'object' || t.id !== (t.id | 0)) return null;
      var c = G.cubes[t.id];
      if (!c || c.locked || !(t.s === c.s || (t.s === 'm' && c.s === '/'))) return null;
      if (kind === 'goal' && (c.zone !== 'resources' || seen[t.id])) return null;
      seen[t.id] = 1; out.push({ s: t.s, id: t.id });
    }
    return out;
  }
  function cleanFrac(v) { return v && v.n === (v.n | 0) && v.d === (v.d | 0) && v.d > 0 ? { n: v.n, d: v.d } : null; }
  function cleanMode(f) {
    if (!f || typeof f !== 'object') return !!f;
    return Eq.mathMode(!!f.fractions, Array.isArray(f.vars) ? f.vars.map(String) : [], Array.isArray(f.goal) ? f.goal.map(String).filter(symOK) : undefined);
  }
  function cleanStage(st) {
    try { st = typeof st === 'string' ? JSON.parse(st) : st; } catch (e) { return null; }
    if (!st || !Array.isArray(st.ops)) return null;
    var ops = Eq.OPS.filter(function (o) { return st.ops.indexOf(o) >= 0; });
    if (!ops.length) return null;
    var mg = +st.maxGoal; if (!(mg >= 5 && mg <= 999)) mg = 50;
    return { id: 'online', name: ops.map(show).join(' ') + (st.fractions ? ' and fractions' : ''), icon: '🌐', ops: ops, fractions: !!st.fractions, need: 0, maxGoal: mg };
  }
  // A small piece of HTML from the host (a result line): keep only the text and <b>.
  function cleanLine(html) {
    try {
      var doc = new DOMParser().parseFromString('<div>' + String(html) + '</div>', 'text/html');
      var walk = function (n) { var out = ''; n.childNodes.forEach(function (c) { if (c.nodeType === 3) out += esc(c.textContent); else if (c.nodeType === 1) { var inner = walk(c); out += c.tagName === 'B' ? '<b>' + inner + '</b>' : inner; } }); return out; };
      return walk(doc.body.firstChild);
    } catch (e) { return esc(String(html).replace(/<[^>]*>/g, '')); }
  }
  function mySeatInfo() {
    var st = stageInfo();
    return { name: cleanName(S.name), jersey: cleanJersey(S.jersey), cards: window.Vari ? Vari.unlockedCount() : 0,
      stage: JSON.stringify({ ops: st.ops, fractions: !!st.fractions, maxGoal: st.maxGoal || 50 }) };
  }
  function seatFrom(v) { if (!v || typeof v !== 'object') return null; return { name: cleanName(v.name), jersey: cleanJersey(v.jersey), cards: Math.max(0, Math.min(9, v.cards | 0)), stage: cleanStage(v.stage) }; }

  // ================================================================ HOST
  function hostGame() {
    saveIdentity();
    modal('<h2 class="hero">Host a game</h2><p class="ol-wait">Getting a game code…</p>');
    Net.init().then(function (uid) {
      var tries = 0;
      function attempt() {
        var code = WORDS[Math.floor(Math.random() * WORDS.length)] + (10 + Math.floor(Math.random() * 90));
        var room = { v: 1, host: uid, created: Net.stamp(), seats: { 0: mySeatInfo() } };
        return Net.create('rooms/' + code, room).then(function (ok) {
          if (ok) return code;
          if (++tries > 6) throw new Error('no free code');
          return attempt();
        });
      }
      return attempt().then(function (code) {
        O = newHost(code, uid); save(); hostSubs(); lobbyHost();
      });
    }).catch(problem);
  }
  function newHost(code, uid) {
    return { role: 'host', code: code, seat: 0, uid: uid, subs: [], guest: null, prompts: {}, waiting: {}, answers: {}, ready: {}, result: null, resultN: 0, over: false,
      emote: null, emoteN: 0, acting: null, stage: null, seq: 0, lastPub: '', seenActs: {}, hostReady: 0, resultCh: null, noGoal: false, here: {}, gone: false };
  }
  function hostSubs() {
    O.subs.push(Net.subscribe(base() + '/seats/1', function (v) {
      if (!O || O.role !== 'host') return;
      var had = !!O.guest; O.guest = seatFrom(v);
      if (!on()) { if (!!O.guest !== had || !O.guest) lobbyHost(); }
      save();
    }));
    O.subs.push(Net.subscribe(base() + '/acts', onActs));
    O.subs.push(Net.presence(base() + '/here', 0, onPresence));
  }
  var lobbyStage = 'mine';
  function lobbyHost() {
    if (!O || O.role !== 'host' || on()) return;
    var code = prettyCode(O.code);
    if (!O.guest) {
      modal('<h2 class="hero">' + ico('people') + ' Your game code</h2><div class="ol-code" aria-label="Game code">' + esc(code) + '</div>' +
        '<p style="text-align:center">Read this code to the other player. They tap <b>Online</b>, then <b>Join a game</b>, and type it in.</p>' +
        '<p class="ol-wait">Waiting for them to join…</p><div class="row"><button class="btn" data-act="olCancel">Cancel</button></div>');
      return;
    }
    var g = O.guest, mine = stageInfo(), theirs = g.stage, same = !theirs || (theirs.ops.join() === mine.ops.join() && theirs.fractions === !!mine.fractions);
    if (same) lobbyStage = 'mine';
    var opt = function (id, who, st) { return '<button class="ol-pick' + (lobbyStage === id ? ' on' : '') + '" data-act="olStage" data-arg="' + id + '"><b>' + esc(who) + '\'s cubes</b><span>' + esc(st.ops.map(show).join('  ')) + (st.fractions ? ' and fractions' : '') + '</span></button>'; };
    modal('<h2 class="hero">' + ico('people') + ' ' + esc(g.name) + ' joined!</h2>' +
      '<div class="ol-vs"><span class="jersey">' + esc(cleanJersey(S.jersey)) + '</span><b>' + esc(cleanName(S.name)) + '</b><span class="ol-vsx">vs</span><b>' + esc(g.name) + '</b><span class="jersey j2">' + esc(g.jersey) + '</span></div>' +
      (same ? '' : '<p style="text-align:center;margin-bottom:4px">Which operations should the cubes have?</p><div class="ol-picks">' + opt('mine', cleanName(S.name), mine) + opt('theirs', g.name, theirs) + '</div>') +
      '<p style="text-align:center;font-size:16px">' + (S.set.shakes || 3) + ' shakes. Talk on FaceTime while you play!</p>' +
      '<div class="row"><button class="btn green big" data-act="olKick">' + ico('play') + ' Kick off!</button><button class="btn" data-act="olCancel">Cancel</button></div>');
  }
  ACT.olStage = function (el) { lobbyStage = el.dataset.arg === 'theirs' ? 'theirs' : 'mine'; Snd.click(); lobbyHost(); };
  ACT.olKick = function () {
    if (!O || !O.guest) return;
    closeModal();
    var cfg = { seats: [{ name: cleanName(S.name), jersey: cleanJersey(S.jersey) }, { name: O.guest.name, jersey: O.guest.jersey }], stage: lobbyStage === 'theirs' ? O.guest.stage : null };
    startMatch('online', null, cfg);
  };
  // Called from startMatch (js/game.js) for mode 'online'.
  function setup(g, cfg) {
    cfg = cfg || {};
    var seats = cfg.seats || [{}, {}];
    g.players[0].jersey = cleanJersey(seats[0].jersey || S.jersey);
    g.players.push({ name: cleanName(seats[1].name || 'Tata'), ai: null, score: 0, list: [], jersey: cleanJersey(seats[1].jersey) });
    g.matchId = rid(); g.rollNo = 0;
    if (O) {
      O.prompts = {}; O.waiting = {}; O.answers = {}; O.ready = {}; O.result = null; O.over = false; O.hostReady = 0; O.resultCh = null; O.noGoal = false;
      O.stage = cfg.stage || null;
    }
  }

  // ---- publishing the game ----
  var pubTimer = null;
  function schedulePublish(force) { if (force) O.force = true; if (pubTimer) return; pubTimer = setTimeout(function () { pubTimer = null; publish(); }, 0); }
  function publish() {
    if (!O || O.role !== 'host') return;
    var body = { g: (G && G.mode === 'online') ? JSON.parse(JSON.stringify(G, skipKeys)) : null, p: O.prompts, r: O.result, o: O.over, e: O.emote, ng: O.noGoal };
    var s = JSON.stringify(body);
    if (s === O.lastPub && !O.force) return;
    O.force = false; O.lastPub = s; O.seq++;
    Net.write(base() + '/state', { seq: O.seq, g: s });
    save();
  }

  // ---- asking the other device for its own input ----
  function ask(seat, spec, cb) {
    var id = [G.matchId, G.rollNo, spec.k, spec.mode || '', orderCounter, seat, spec.t || 0].join('.');
    spec.id = id;
    if (cb) O.waiting[id] = cb;
    if (O.answers[id] !== undefined) setTimeout(function () { deliver(id); }, 0);
    else if (!O.prompts[seat] || O.prompts[seat].id !== id) O.prompts[seat] = spec;
    schedulePublish();
  }
  function deliver(id) {
    var cb = O && O.waiting[id], ans = O && O.answers[id];
    if (!cb || ans === undefined) return;
    delete O.waiting[id];
    schedulePublish();
    cb(ans);
  }
  function hasPrompt(seat) { return !!(O.prompts && O.prompts[seat]); }
  function remoteSeats() { return G ? idxs().filter(function (i) { return i !== 0 && !isAI(i); }) : []; }

  // ---- actions from the guest ----
  function onActs(v) {
    if (!O || O.role !== 'host' || !v) return;
    Object.keys(v).filter(function (k) { return v[k] != null; }).sort(function (a, b) { return a - b; }).forEach(function (k) {
      if (O.seenActs[k]) return;
      O.seenActs[k] = true;
      var a = null; try { a = JSON.parse(v[k]); } catch (e) {}
      Net.write(base() + '/acts/' + k, null);
      if (a && typeof a === 'object') { try { handle(a, 1); } catch (e) { if (window.console) console.error('[online] action', a, e); } }
      if (O) schedulePublish(true);
    });
  }
  function handle(a, seat) {
    if (a.a === 'leave') { otherLeft(seat); return; }
    if (a.a === 'emote') { showEmote(a.id); return; }
    if (!on()) return;
    var turnOK = G.phase === 'move' && G.turn === seat && !G.busy && !G.carrying;
    if (a.a === 'move' && turnOK) {
      O.acting = seat; try { doMove(a.id | 0, String(a.zone)); } finally { O.acting = null; }
    } else if (a.a === 'ch' && turnOK && (a.kind === 'now' || a.kind === 'impossible')) {
      O.acting = seat; try { ACT[a.kind === 'now' ? 'callNow' : 'callImp']({ dataset: { arg: String(seat) } }); } finally { O.acting = null; }
    } else if (a.a === 'goal' && G.phase === 'goal' && G.setter === seat && !G.busy && !hasPrompt(seat) && !O.noGoal) {
      var toks = cubeTokens(a.tokens, 'goal'), g = toks && Eq.checkGoal(toks, G.fractions);
      if (g && g.ok) setGoal(toks, g.value);
    } else if (a.a === 'nogoal' && G.phase === 'goal' && G.setter === seat && !G.busy && !hasPrompt(seat) && !O.noGoal) {
      O.acting = seat; try { ACT.noGoal(); } finally { O.acting = null; }
    } else if (a.a === 'ans' && typeof a.id === 'string') {
      var p = O.prompts[seat];
      if (p && p.id === a.id) { delete O.prompts[seat]; O.answers[a.id] = a; deliver(a.id); }
    } else if (a.a === 'ready') {
      O.ready[seat] = Math.max(O.ready[seat] || 0, a.n | 0);
      if (G.phase === 'over' && O.result && O.hostReady === O.result.n && !O.over) nextShake();
    } else if (a.a === 'rematch' && O.over) {
      ACT.rematch();
    }
  }
  function otherLeft(seat) {
    if (!O) return;
    if (!on()) { O.guest = null; lobbyHost(); return; }
    O.gone = true; hideBanner();
    if (B) { $('#builder').classList.remove('on'); B = null; }
    modal('<h2 class="hero">' + nm(seat) + ' left the game</h2><p style="text-align:center">That\'s OK! Everything you earned is saved. You can start a new online game any time.</p>' +
      '<div class="row"><button class="btn green" data-act="toMenu">' + ico('home') + ' Menu</button></div>');
  }

  // ================================================================ GUEST
  function joinGame() {
    var code = (($('#olCode') || {}).value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    saveIdentity();
    if (!/^[A-Z]{3,6}[0-9]{2}$/.test(code)) { joinError('A code is a word and a number, like <b>FROG 47</b>.'); return; }
    var msg = $('#olJoinMsg'); if (msg) msg.innerHTML = 'Looking for the game…';
    Net.init().then(function (uid) {
      return Net.read('rooms/' + code + '/host').then(function (h) {
        if (!h) { joinError('No game has that code. Check it with the host and try again.'); return; }
        if (h === uid) { joinError('That\'s your own game! Join from the other device.'); return; }
        return Net.transaction('rooms/' + code + '/guest', function (cur) { return (cur === null || cur === uid) ? uid : undefined; }).then(function (ok) {
          if (!ok) { joinError('Someone else is already playing in that game.'); return; }
          return Net.write('rooms/' + code + '/seats/1', mySeatInfo()).then(function () {
            O = newGuest(code, uid); save(); guestSubs();
            modal('<h2 class="hero">' + ico('people') + ' You joined!</h2><p class="ol-wait">Waiting for the host to kick off…</p><div class="row"><button class="btn" data-act="olCancel">Leave</button></div>');
          });
        });
      });
    }).catch(problem);
  }
  function joinError(html) { var m = $('#olJoinMsg'); if (m) m.innerHTML = '<span class="ol-err">' + html + '</span>'; Snd.boop(); }
  function newGuest(code, uid) {
    return { role: 'guest', code: code, seat: 1, uid: uid, subs: [], n: 0, sent: {}, open: null, applied: 0, acked: 0, overShown: null, state: null, pouring: false, poured: '',
      hint: {}, trailed: false, vsFor: null, resultOpen: 0, here: {}, gone: false, lastEmote: 0 };
  }
  function guestSubs() {
    O.subs.push(Net.subscribe(base() + '/state', onState));
    O.subs.push(Net.subscribe(base() + '/host', function (h) { if (O && O.role === 'guest' && h === null) ended(); }));
    O.subs.push(Net.presence(base() + '/here', 1, onPresence));
  }
  function send(act) {
    if (!O) return;
    O.n++; save();
    Net.write(base() + '/acts/' + O.n, JSON.stringify(act));
  }
  function onState(v) {
    if (!O || O.role !== 'guest' || !v || typeof v.g !== 'string') return;
    var st; try { st = JSON.parse(v.g); } catch (e) { return; }
    O.state = st;
    if (O.pouring) return; // after the vs screen / pour
    apply(st);
  }
  function rot(i) { if (i === null || i === undefined || !G) return null; var n = G.players.length; return ((i - O.seat) % n + n) % n; }
  function abs(i) { var n = G.players.length; return (i + O.seat) % n; }
  function okHost(h) {
    if (!h || !Array.isArray(h.cubes) || h.cubes.length !== 24 || !Array.isArray(h.players) || h.players.length < 2 || h.players.length > 4) return false;
    return h.cubes.every(function (c, i) { return c && c.id === i && Eq.COLORS.indexOf(c.color) >= 0 && Eq.CUBE_FACES[c.color].indexOf(c.s) >= 0 && ZONES.indexOf(c.zone) >= 0; });
  }
  // The host's game, seen from this device's seat.
  function mirror(h) {
    var n = h.players.length, me = O.seat, R = function (i) { return (i === null || i === undefined) ? null : ((i - me) % n + n) % n; }, players = [];
    for (var k = 0; k < n; k++) { var p = h.players[(k + me) % n] || {}; players.push({ name: cleanName(p.name), ai: null, score: +p.score || 0, list: (p.list || []).map(function (x) { return +x || 0; }), jersey: cleanJersey(p.jersey) }); }
    var ch = h.ch && typeof h.ch === 'object' ? { kind: h.ch.kind === 'now' ? 'now' : 'impossible', challenger: R(h.ch.challenger), mover: R(h.ch.mover), tp: R(h.ch.tp) } : null;
    return { mode: 'online', matchId: String(h.matchId), shakes: h.shakes | 0, shake: h.shake | 0, setter: R(h.setter), players: players,
      cubes: h.cubes.map(function (c) { return { id: c.id, color: c.color, s: c.s, zone: c.zone, order: +c.order || 0, locked: !!c.locked }; }),
      goalTokens: safeTokens(h.goalTokens), goal: cleanFrac(h.goal), lastMover: R(h.lastMover), turn: R(h.turn), phase: String(h.phase || 'roll'), rolling: !!h.rolling,
      busy: false, carrying: false, ch: ch, ops: Array.isArray(h.ops) ? h.ops.filter(symOK) : [], fractions: cleanMode(h.fractions),
      vari: (window.Vari && Vari.card(h.vari)) ? h.vari : null, variDone: !!h.variDone, rollNo: h.rollNo | 0, trailed: !!O.trailed, cfg: null };
  }
  function apply(st) {
    var h = st.g;
    if (!h) return;          // still in the lobby
    if (!okHost(h)) { if (window.console) console.warn('[online] state refused'); return; }
    var fresh = !G || G.mode !== 'online' || G.matchId !== String(h.matchId);
    var m = mirror(h), prev = null;
    if (fresh) {
      G = m; G.selected = null; G.highlight = null; G.speech = null; G.hintUsed = false; G.justMoved = null;
      O.emoteSeen = st.e ? st.e.n : 0; // don't replay an old emote after a reload
      startMirror();
      if (O.vsFor !== G.matchId && h.phase === 'roll' && h.shake === 1 && window.Social && Social.vsScreen) {
        O.vsFor = G.matchId; O.pouring = true;
        Social.vsScreen(G.players, function () { if (!O) return; O.pouring = false; if (O.state) apply(O.state); });
        renderGame(); return;
      }
      O.vsFor = G.matchId;
    } else {
      prev = { phase: G.phase, goal: G.goal, zones: G.cubes.map(function (c) { return c.zone; }), vari: G.vari, rollNo: G.rollNo, ch: G.ch, setter: G.setter };
      var keep = { selected: G.selected, highlight: G.highlight, speech: G.speech };
      Object.keys(m).forEach(function (k) { G[k] = m[k]; });
      G.selected = keep.selected; G.highlight = keep.highlight; G.speech = keep.speech;
    }
    var rk = G.matchId + '.' + G.rollNo;
    G.hintUsed = !!O.hint[rk];
    if (G.selected != null && (!G.cubes[G.selected] || G.cubes[G.selected].zone !== 'resources' || G.turn !== 0)) G.selected = null;
    if (G.highlight != null && (!G.cubes[G.highlight] || G.cubes[G.highlight].zone !== 'resources')) G.highlight = null;
    // A new roll: the cup pours on this device too (the faces it lands on are replaced by the host's).
    if (G.phase === 'roll' && G.rolling && O.poured !== rk) {
      O.poured = rk; xpLog = []; cue('reset'); board(''); Snd.setMood('play');
      if (window.Vari) Vari.chip();
      if (T3.active()) {
        O.pouring = true; renderGame();
        T3.pour(G.cubes, function () { if (!O) return; O.pouring = false; G.rolling = false; if (O.state) apply(O.state); });
        return;
      }
      Snd.clatter();
    }
    if (G.phase === 'roll' && G.rolling && T3.active()) { guestSpeech(st); return; } // our pour is done; the host's faces are on the way
    if (prev) effects(prev, st);
    prompts(st);
    if (st.r && st.r.mid === G.matchId && st.r.n > O.acked && G.phase === 'over' && O.resultOpen !== st.r.n && !O.open) showResult(st.r);
    if (st.o && O.overShown !== G.matchId && O.acked >= (st.r ? st.r.n : 0) && !O.open) showEnd();
    if (st.e && st.e.seat !== O.seat && st.e.n > (O.emoteSeen || 0)) { O.emoteSeen = st.e.n; showEmote(st.e.id); }
    O.ng = !!st.ng;
    guestSpeech(st);
    renderGame();
  }
  function startMirror() {
    closeModal(); $('#builder').classList.remove('on'); B = null; O.open = null; O.resultOpen = 0;
    go('game'); Snd.setMood('play'); setCreature(null); playerShow(); xpLog = [];
    if (Snd.ambience) Snd.ambience(['stadium', 'night', 'beach', 'volcano'].indexOf(S.cos.mat) >= 0 ? 'stadium' : 'room');
    setTimeout(function () { if (G) playerMood('wave'); }, 500);
  }
  // Sounds, banners and camera moments that the host's game made happen.
  function effects(prev, st) {
    var moved = null;
    G.cubes.forEach(function (c, i) { if (prev.zones[i] === 'resources' && ['required', 'permitted', 'forbidden'].indexOf(c.zone) >= 0) moved = c.id; });
    if (moved !== null) { G.justMoved = moved; if (!T3.active()) Snd.thunk(); }
    if (!prev.goal && G.goal && G.phase === 'move') {
      Snd.thunk(); Snd.chime(); board('GOAL' + String.fromCharCode(10) + Eq.fmt(G.goal)); shot('goal');
      if (prev.phase === 'goal' && G.setter === 0) { S.stats.goalsSet++; checkBadges({ type: 'goal' }); }
    }
    if (prev.phase !== 'challenge' && G.phase === 'challenge' && G.ch) {
      var ch = G.ch, cname = G.players[ch.challenger].name;
      banner(ch.kind === 'now' ? '⚡ NOW!' : '🚫 IMPOSSIBLE!', cname + ' challenges!');
      if (ch.challenger === 0) playerMood('now', { kind: ch.kind });
      Snd.slam(); Snd.setMood('challenge'); cue('challenge'); fx3('shake'); board(ch.kind === 'now' ? 'NOW!' : 'IMPOSSIBLE!'); crowdSay('ooh');
    }
    if (prev.vari !== G.vari && window.Vari) Vari.chip(!!G.vari);
  }
  function guestSpeech(st) {
    var p = st.p && st.p[O.seat], line = '';
    var pending = p && !O.sent[p.id];
    if (G.phase === 'roll') line = 'Rolling the cubes…';
    else if (pending && p.k === 'sol') line = 'Write your Solution!';
    else if (pending && p.k === 'goal') line = 'Build a Goal, then a Solution for it, using any Resource cubes!';
    else if (pending) line = 'Your turn to choose!';
    else if (G.phase === 'goal') line = G.setter === 0 ? (O.ng ? 'You said <b>No Goal</b>. ' + wait(1, 'answer') : 'You rolled the cubes, so you set the <b>Goal</b>! Use 1 to 6 cubes. Two digit cubes side by side make a two-digit number, like 2 and 4 → 24.') : wait(G.setter, 'set the Goal');
    else if (G.phase === 'move') {
      if (G.turn === 0) line = zoneCubes('resources').length === 1 ? 'Your turn. Only ONE cube left! Move it to <b>Required</b> or <b>Permitted</b>, or call <b>Impossible!</b> if no Solution can be made.' : 'Your turn! Tap a Resource cube, then tap a section. Or, if you spot something, challenge: <b>Now!</b> or <b>Impossible!</b>';
      else line = wait(G.turn, 'move');
    } else if (G.phase === 'challenge' && G.ch) {
      var w = G.ch.kind === 'now' ? G.ch.challenger : G.ch.mover;
      line = w === 0 ? 'Your Solution is in! The result is coming…' : wait(w, 'write a Solution');
    } else if (G.phase === 'lastcheck') line = G.lastMover === 0 ? wait(1, 'decide: Impossible! or write a Solution') : 'The last cube is on the mat!';
    else if (G.phase === 'lastwrite') line = 'Everybody writes a Solution! ' + wait(1, 'finish writing');
    else if (G.phase === 'over') line = (st.r && O.acked >= st.r.n && !st.o) ? wait(1, 'start the next shake') : 'Shake over!';
    if (line && (!G.speech || G.speech.text !== line)) say('pip', line);
  }
  // Questions for this device (its own Solution, card, choice). Opened once per question.
  function prompts(st) {
    var p = st.p && st.p[O.seat];
    if (O.open && (!p || p.id !== O.open)) { // the host withdrew the question (it moved on)
      O.open = null; $('#builder').classList.remove('on'); B = null; closeModal();
    }
    if (!p || O.sent[p.id] || O.open === p.id || typeof p.id !== 'string') return;
    O.open = p.id;
    if (p.k === 'sol') openSolutionBuilder(0, ['now', 'impossible', 'last', 'free'].indexOf(p.mode) >= 0 ? p.mode : 'last', function (ok, tokens) { answer(p, { tokens: tokens || null }); });
    else if (p.k === 'goal') openGoalBuilder(0, function (tokens) { answer(p, { tokens: tokens }); }, true);
    else if (p.k === 'vari') variPrompt(p);
    else if (p.k === 'nogoal') {
      pendingP = p;
      modal('<h2>🤷 No Goal?</h2><p style="text-align:center"><b>' + nm(1) + '</b> says no Goal can be made with these cubes. Do you agree?</p>' +
        '<div class="row"><button class="btn green" data-act="olAns" data-arg="agree">I agree: roll again</button><button class="btn now" data-act="olAns" data-arg="challenge">Challenge! I can make one</button></div>');
    } else if (p.k === 'last') {
      pendingP = p;
      modal('<h2 class="hero">Last cube played!</h2><p style="text-align:center">If you think NOBODY can make the Goal now, call Impossible! Otherwise everybody writes a Solution (4 points if correct, 2 if not).</p>' +
        '<div class="row"><button class="btn imp" data-act="olAns" data-arg="imp">' + ico('ban') + ' Impossible!</button><button class="btn green" data-act="olAns" data-arg="write">' + ico('pencil') + ' Let\'s write!</button></div>');
    } else O.open = null;
  }
  var pendingP = null;
  ACT.olAns = function (el) {
    var p = pendingP, v = el.dataset.arg; pendingP = null; closeModal();
    if (!p || !O) return;
    if (p.k === 'nogoal') answer(p, { challenge: v === 'challenge' });
    else if (p.k === 'last') answer(p, { imp: v === 'imp' });
    else if (p.k === 'vari') { if (v && window.Vari) { var c = Vari.card(v); if (c) say('pip', 'You picked <b>' + c.icon + ' ' + esc(c.name) + '</b>!'); } answer(p, { card: v || '' }); }
  };
  function variPrompt(p) {
    var cards = (p.cards || []).filter(function (id) { return Vari.card(id); }).filter(function (id) { return !Vari.card(id).tier; });   // Middle cards are not synced online yet
    var v = S.vari || {}, n = Vari.unlockedCount(), fresh = n > (v.seen || 0) ? Vari.unlocked()[n - 1] : null;
    if (fresh) { if (S.vari) S.vari.seen = n; persist(); }
    pendingP = p;
    modal('<h2>Variation card?</h2>' + (fresh ? '<p class="vari-new-line">✨ New card unlocked: <b>' + fresh.icon + ' ' + esc(fresh.name) + '</b>!</p>' : '') +
      '<p class="vari-small">You set the Goal, so you may pick ONE extra rule for this shake. Or play without one.</p>' +
      '<div class="vari-cards">' + cards.map(function (id) { return Vari.cardHTML(Vari.card(id), true, fresh && fresh.id === id).replace(/data-act="variPick"/g, 'data-act="olAns"'); }).join('') +
      '<button class="vari-card none" data-act="olAns" data-arg=""><span class="vc-icon">🙂</span><b>No card</b><span class="vc-rule">Normal rules this shake.</span></button></div>');
  }
  function answer(p, body) {
    O.sent[p.id] = 1; O.open = null;
    body.a = 'ans'; body.id = p.id; send(body);
    if (O.state) guestSpeech(O.state);
    renderGame();
  }
  // The shake's results, the same for both players. Each device only adds its OWN player's progress.
  function showResult(res) {
    O.resultOpen = res.n;
    var n = G.players.length, pts = {}, sols = {};
    Object.keys(res.pts || {}).forEach(function (k) { pts[rot(+k)] = +res.pts[k] || 0; });
    Object.keys(res.sols || {}).forEach(function (k) {
      var s = res.sols[k]; if (!s) return;
      sols[rot(+k)] = { ok: !!s.ok, tokens: s.tokens ? safeTokens(s.tokens) : null, chk: s.chk && Array.isArray(s.chk.reasons) ? { reasons: s.chk.reasons.slice(0, 6).map(String) } : null };
    });
    if (res.n > O.applied) { O.applied = res.n; guestProgress(res, pts); save(); }
    var sample = sampleSolution();
    if (sample) Object.keys(sols).forEach(function (k) { var s = sols[k]; if (sample && s && s.ok && s.tokens && s.tokens.map(function (x) { return typeof x === 'string' ? x : x.s; }).join('') === sample.join('')) sample = null; });
    var anyOk = Object.keys(sols).some(function (k) { return sols[k] && sols[k].ok; });
    var p0 = pts[0] || 0;
    if (p0 >= 4) { Snd.chime(); playerMood('cheer'); } else { Snd.chime(); playerMood('clap'); }
    var html = '<h2 class="hero">Shake over!</h2>' +
      '<div style="text-align:center;font-size:18px">Goal: <b>' + (G.goal ? Eq.fmt(G.goal) : '?') + '</b></div>' +
      (res.lines || []).slice(0, 6).map(function (l) { return '<p>' + cleanLine(l) + '</p>'; }).join('') +
      idxs().map(function (i) { return solHTML(i, sols[i]); }).join('') +
      (sample ? '<p><b>' + (anyOk ? 'Another way' : 'One way that works') + ':</b></p>' + exprBox(sample) + '<p style="text-align:center;font-weight:800">= ' + Eq.fmt(G.goal) + (G.sampleWild != null ? ' <small>(every 0 stands for ' + G.sampleWild + ')</small>' : '') + '</p>' :
        (G.goal && !anyOk ? '<div class="okbox">I searched and couldn\'t find any Solution with these cubes.</div>' : '')) +
      idxs().map(function (i) { return '<div class="score-line' + ((pts[i] || 0) >= 4 ? ' win' : '') + '"><span>' + esc(G.players[i].name) + '</span><span class="p">+' + (pts[i] || 0) + ' → ' + G.players[i].score + '</span></div>'; }).join('') +
      (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '') +
      '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="olReady" data-arg="' + res.n + '">' + (G.shake >= G.shakes ? 'See the results' : 'Next shake') + ' ' + ico('play') + '</button></div>';
    setTimeout(function () { if (O && O.resultOpen === res.n) modal(html, null); }, 700);
  }
  ACT.olReady = function (el) {
    var n = +el.dataset.arg; closeModal();
    drainQueue(function () { if (!O) return; O.acked = Math.max(O.acked, n); O.resultOpen = 0; save(); send({ a: 'ready', n: n }); if (O.state) apply(O.state); });
  };
  function guestProgress(res, pts) {
    var me = pts[0] || 0, ch = res.ch;
    if (ch && typeof ch === 'object') {
      var c = rot(ch.challenger), m = rot(ch.mover);
      if (c === 0) {
        S.stats.challenges++;
        var won = me === 6;
        if (won) { S.stats.challengeWins++; if (ch.kind === 'now') { S.stats.nowWins++; addXP(25, 'Correct Now! challenge'); } else { S.stats.impWins++; addXP(30, 'Correct Impossible! call'); addStar(); } }
        checkBadges({ type: 'challenge', kind: ch.kind, won: won });
      } else if (m === 0 && me === 6 && ch.kind === 'now') addXP(15, 'Clever move: their Now! failed');
    }
    S.stats.shakes++; S.stats.pvpShakes++;
    if (G.hintUsed) S.stats.noHint = 0; else S.stats.noHint++;
    var best = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    if (G.players[0].score < best) O.trailed = true;
    checkBadges({ type: 'shake' });
    persist();
    try { Net.write(base() + '/seats/1', mySeatInfo()); } catch (e) {} // new card unlocks reach the host
  }
  function showEnd() {
    O.overShown = G.matchId; save();
    var top = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    var winners = idxs().filter(function (i) { return G.players[i].score === top; }), names = winners.map(function (i) { return esc(G.players[i].name); });
    victoryFX(); Snd.fanfare(); setTimeout(Snd.crowd, 500); Snd.setMood('win'); cue('win');
    banner('⚽ GOOOAL!', winners.length > 1 ? 'It\'s a tie!' : G.players[winners[0]].name + ' wins!');
    if (winners.indexOf(0) >= 0 && winners.length === 1) { playerMood('cheer'); checkBadges({ type: 'match', won: true, trailed: O.trailed, perfect: G.players[0].list.every(function (v) { return v >= 4; }) }); }
    else playerMood('clap');
    persist();
    var order = idxs().sort(function (x, y) { return G.players[y].score - G.players[x].score; });
    var html = '<h2 class="hero">' + (winners.length > 1 ? 'Tie: ' + names.join(' & ') + '!' : names[0] + ' wins!') + '</h2>' +
      order.map(function (i) { return '<div class="score-line' + (G.players[i].score === top ? ' win' : '') + '"><span>' + (G.players[i].score === top ? ico('trophy') + ' ' : '') + esc(G.players[i].name) + '</span><span class="p">' + G.players[i].score + '</span></div>'; }).join('') +
      (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '');
    if (window.Social && Social.matchCard) { try { html += Social.matchCard({}); } catch (e) {} }
    html += '<div class="row" style="margin-top:12px"><button class="btn green" data-act="olRematch">Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
    setTimeout(function () { if (O && G && O.overShown === G.matchId) modal(html, null); }, 600);
  }
  ACT.olRematch = function () { closeModal(); drainQueue(function () { if (!O) return; O.trailed = false; save(); send({ a: 'rematch' }); say('pip', wait(1, 'start the new match')); }); };
  function ended() {
    if (!O) return;
    var o = O; stopSubs(o); O = null; forget(); hideBanner();
    var g = G;
    if (B) { $('#builder').classList.remove('on'); B = null; }
    if (g && g.mode === 'online') {
      modal('<h2 class="hero">The game has ended</h2><p style="text-align:center"><b>' + esc(g.players[1].name) + '</b> ended the online game. Everything you earned is saved.</p>' +
        '<div class="row"><button class="btn green" data-act="toMenu">' + ico('home') + ' Menu</button></div>');
    } else {
      modal('<h2>The game has ended</h2><p style="text-align:center">The host closed the game.</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
    }
  }

  // ================================================================ BOTH: presence, emotes, leaving
  var goneTimer = null, bannerShown = false;
  function onPresence(map) {
    if (!O) return;
    O.here = map;
    var other = O.role === 'host' ? (O.guest ? '1' : null) : '0';
    if (other === null) return;
    var present = !!map[other];
    if (present) {
      clearTimeout(goneTimer); goneTimer = null;
      if (bannerShown) { hideBanner(); if (on()) toast(nm(1) + ' is back!'); }
    } else if (!goneTimer && !bannerShown) {
      goneTimer = setTimeout(function () { goneTimer = null; if (O && on() && !O.gone && !(O.here || {})[other]) showBanner(); }, 3000);
    }
  }
  function showBanner(quiet) {
    var el = $('#olBanner');
    if (!el) { el = document.createElement('div'); el.id = 'olBanner'; el.className = 'ol-banner'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    bannerShown = true;
    el.innerHTML = '<span><b>' + nm(1) + '</b> lost connection: waiting…</span>' + (quiet ? '' : '<span class="ol-bb"><button class="btn small" data-act="olKeepWaiting">Keep waiting</button><button class="btn small" data-act="olEndMatch">End the match</button></span>');
  }
  function hideBanner() { bannerShown = false; var el = $('#olBanner'); if (el) el.remove(); }
  ACT.olKeepWaiting = function () { showBanner(true); };
  ACT.olEndMatch = function () {
    modal('<h2>End the match?</h2><p style="text-align:center">Nobody loses anything: all the XP and badges you earned are saved. You can start a new online game later.</p>' +
      '<div class="row"><button class="btn" data-act="closeModal">Keep waiting</button><button class="btn pink" data-act="toMenu">End the match</button></div>');
  };
  function toast(html) {
    var t = document.createElement('div'); t.className = 'toast ol-toast'; t.innerHTML = '<div>' + html + '</div>';
    $('#toasts').appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; }, 2600);
    setTimeout(function () { t.remove(); }, 3200);
  }
  function showEmote(id) {
    var e = window.Social && Social.emotes ? Social.emotes.filter(function (x) { return x.id === id; })[0] : null;
    if (e && Social.bubble) Social.bubble('opp', e.say, { big: e.label.length <= 2 });
  }
  function stopSubs(o) { (o.subs || []).forEach(function (f) { try { f(); } catch (e) {} }); o.subs = []; clearTimeout(goneTimer); goneTimer = null; }
  // Leave on purpose: the host closes the room; the guest says goodbye and frees its seat.
  function leave() {
    if (!O) return;
    var o = O; O = null; stopSubs(o); forget(); hideBanner();
    if (o.role === 'host') Net.write('rooms/' + o.code, null);
    else {
      o.n++; Net.write('rooms/' + o.code + '/acts/' + o.n, JSON.stringify({ a: 'leave' }));
      Net.write('rooms/' + o.code + '/seats/1', null); Net.write('rooms/' + o.code + '/guest', null);
    }
  }
  ACT.olCancel = function () { leave(); closeModal(); };
  function problem(e) {
    if (window.console) console.error('[online]', e);
    modal('<h2>Couldn\'t connect</h2><p style="text-align:center">The game couldn\'t reach the online service. Check the Wi-Fi and try again.</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
  }

  // ================================================================ MENU
  function setupCardHTML() {
    return '<div class="opp mode" data-act="online"><span class="avatar lg" style="background:#d0ebff;color:#1864ab;font-size:46px">' + ico('people') + '</span><h3>Online</h3><div class="otitle">Play on two devices, far apart (talk on FaceTime)</div></div>';
  }
  function saveIdentity() {
    var n = $('#olName'), j = $('#olJersey');
    if (n && n.value.trim()) S.name = cleanName(n.value);
    if (j && j.value.trim()) S.jersey = cleanJersey(j.value);
    persist();
  }
  ACT.online = function () {
    if (!Net.available()) {
      modal('<h2 class="hero">' + ico('people') + ' Online</h2><p style="text-align:center">Online play isn\'t switched on yet. A grown-up needs to finish the setup first (it\'s written down in <b>docs/handoff/online.md</b>).</p>' +
        '<div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
      return;
    }
    if (O) { if (O.role === 'host') lobbyHost(); else modal('<h2 class="hero">You joined!</h2><p class="ol-wait">Waiting for the host to kick off…</p><div class="row"><button class="btn" data-act="olCancel">Leave</button></div>'); return; }
    modal('<h2 class="hero">' + ico('people') + ' Play online</h2>' +
      '<p style="text-align:center">Play on two devices, far apart. Talk on FaceTime while you play!</p>' +
      '<div class="setrow"><label>Your first name</label><input type="text" id="olName" maxlength="14" autocomplete="off" value="' + esc(S.name || '') + '"></div>' +
      '<div class="setrow"><label>Your jersey number</label><input type="text" id="olJersey" maxlength="2" inputmode="numeric" style="width:70px" value="' + esc(S.jersey || '7') + '"></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn big green" data-act="olHost">' + ico('play') + ' Host a game</button><button class="btn big" data-act="olJoinOpen">Join a game</button></div>' +
      '<div class="row"><button class="btn small" data-act="closeModal">Back</button></div>');
  };
  ACT.olHost = function () { hostGame(); };
  ACT.olJoinOpen = function () {
    saveIdentity();
    modal('<h2 class="hero">Join a game</h2><p style="text-align:center">Type the code the host reads to you: a word and a number.</p>' +
      '<div class="row"><input type="text" id="olCode" class="ol-codein" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="FROG 47"></div>' +
      '<p id="olJoinMsg" style="text-align:center;min-height:26px"></p>' +
      '<div class="row"><button class="btn green big" data-act="olJoin">Join!</button><button class="btn" data-act="closeModal">Back</button></div>');
    setTimeout(function () { var i = $('#olCode'); if (i) { i.focus(); i.addEventListener('keydown', function (e) { if (e.key === 'Enter') joinGame(); }); } }, 50);
  };
  ACT.olJoin = function () { joinGame(); };

  // ================================================================ RESUME after a reload / closed tab
  function resume(s) {
    modal('<h2>Back to your online game…</h2><p class="ol-wait">Reconnecting…</p>');
    Net.init().then(function (uid) {
      return Net.read('rooms/' + s.code + '/host').then(function (host) {
        if (!host) throw { gone: true };
        if (s.role === 'host') {
          if (host !== uid) throw { gone: true };
          O = newHost(s.code, uid);
          ['guest', 'answers', 'ready', 'result', 'resultN', 'over', 'emoteN', 'seq', 'stage', 'hostReady'].forEach(function (k) { if (s[k] !== undefined && s[k] !== null) O[k] = s[k]; });
          O.answers = O.answers || {}; O.ready = O.ready || {};
          hostSubs();
          if (s.g) resumeHost(s); else { closeModal(); gotoTitle(); lobbyHost(); }
        } else {
          return Net.read('rooms/' + s.code + '/guest').then(function (gu) {
            if (gu !== uid) throw { gone: true };
            O = newGuest(s.code, uid);
            ['n', 'sent', 'applied', 'acked', 'overShown', 'trailed', 'hint'].forEach(function (k) { if (s[k] !== undefined && s[k] !== null) O[k] = s[k]; });
            O.vsFor = 'resumed';
            closeModal(); gotoTitle();
            modal('<h2 class="hero">You joined!</h2><p class="ol-wait">Waiting for the host…</p><div class="row"><button class="btn" data-act="olCancel">Leave</button></div>');
            guestSubs();
          });
        }
      });
    }).catch(function (e) {
      forget(); O = null; closeModal(); gotoTitle();
      if (e && e.gone) modal('<h2>That game has finished</h2><p style="text-align:center">The online game isn\'t there any more. You can start a new one from <b>Play</b>, then <b>Online</b>.</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
      else problem(e);
    });
  }
  // The host's game continues from its saved position. Whatever was mid-way (a builder, a pop-up) is asked again.
  function resumeHost(s) {
    closeModal();
    G = JSON.parse(s.g); orderCounter = s.oc || 0;
    G.players.forEach(function (p) { p.ai = null; });
    G.busy = false; G.carrying = false; G.selected = null; G.speech = null;
    xpLog = [];
    go('game'); Snd.setMood('play'); setCreature(null); playerShow();
    if (Snd.ambience) Snd.ambience(['stadium', 'night', 'beach', 'volcano'].indexOf(S.cos.mat) >= 0 ? 'stadium' : 'room');
    var ph = G.phase;
    if (!ph || ph === 'roll') { G.shake = G.shake || 1; newShake(); return; }
    if (ph === 'goal') {
      G.cubes.forEach(function (c) { if (c.zone === 'goal') c.zone = 'resources'; });
      G.goalTokens = []; G.goal = null; if (!G.vari) G.variDone = false;
      renderGame(); startGoalPhase(); return;
    }
    if (ph === 'move') { renderGame(); nextTurn(); return; }
    if (ph === 'challenge' && G.ch) {
      renderGame();
      var ch = G.ch, writer = ch.kind === 'now' ? ch.challenger : ch.mover;
      say('pip', 'Back in the game! ' + (writer === 0 ? 'Write your Solution.' : ''));
      writeSolution(writer, ch.kind, function (ok, tokens, chk) { resolveChallenge(ok, tokens, chk, null); });
      return;
    }
    if (ph === 'lastcheck') { renderGame(); lastCubePlayed(); return; }
    if (ph === 'lastwrite') { renderGame(); startLastWrite(); return; }
    if (ph === 'over') {
      renderGame();
      if (O.over) { endMatch(); return; }
      var r = O.result;
      modal('<h2 class="hero">Shake over!</h2>' + (r ? (r.lines || []).map(function (l) { return '<p>' + l + '</p>'; }).join('') : '') +
        idxs().map(function (i) { return '<div class="score-line"><span>' + esc(G.players[i].name) + '</span><span class="p">' + G.players[i].score + '</span></div>'; }).join('') +
        '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="closeModal">' + (G.shake >= G.shakes ? 'See the results' : 'Next shake') + ' ' + ico('play') + '</button></div>', function () { drainQueue(nextShake); });
      return;
    }
    renderGame();
  }

  // ================================================================ HOOKS (wrappers; each is a no-op outside an online match)
  function wrapG(name, make) { var orig = window[name]; if (typeof orig === 'function') window[name] = make(orig); }
  function wrapA(name, make) { var orig = ACT[name]; if (typeof orig === 'function') ACT[name] = make(orig); }

  // Only this device's own player (player 0 here) may act; a remote action being applied counts too.
  wrapG('humanTurn', function (orig) { return function () { var r = orig(); if (!r || !on()) return r; return G.turn === 0 || (O.acting != null && G.turn === O.acting); }; });
  // Nobody passes a device around: every pop-up on this device is for this device's player ("You…").
  wrapG('multiHuman', function (orig) { return function () { return on() ? false : orig(); }; });
  wrapG('renderGame', function (orig) { return function () { orig.apply(this, arguments); if (on() && isHost()) schedulePublish(); }; });
  wrapG('actionsHTML', function (orig) {
    return function () {
      if (!on()) return orig();
      if (isGuest() && (O.pouring || O.open || G.busy || O.ng)) return '';
      if (isHost() && O.noGoal) return '';
      if (G.phase === 'goal' && G.setter !== 0) return '';
      var out = orig();
      if (G.phase === 'move' && window.Social && Social.emoteBar && T3.active()) out += Social.emoteBar();
      return out;
    };
  });
  // The match's operations: chosen in the lobby (this device's, or the other player's unlocks).
  wrapG('stageInfo', function (orig) { return function () { return (on() && isHost() && O.stage) ? O.stage : orig(); }; });
  wrapG('newShake', function (orig) { return function (fixed) { if (on() && isHost()) { G.rollNo = (G.rollNo || 0) + 1; O.prompts = {}; O.noGoal = false; } return orig(fixed); }; });
  wrapG('startGoalPhase', function (orig) {
    return function () {
      if (!on() || !isHost() || G.setter === 0) return orig();
      // Variation card: the other player picks from the cards unlocked on THEIR device.
      if (window.Vari && !G.variDone) {
        G.variDone = true;
        var setter = G.setter, n = (O.guest && O.guest.cards) || 0;
        var cards = Vari.CARDS.slice(0, n).map(function (c) { return c.id; }).filter(Vari.hasEffect).filter(function (id) { return !Vari.card(id).tier; });
        if (cards.length) {
          say('pip', wait(setter, 'pick a variation card')); renderGame();
          ask(setter, { k: 'vari', cards: cards }, function (ans) {
            if (ans && cards.indexOf(ans.card) >= 0) { Vari.apply(ans.card); var c = Vari.card(ans.card); say('pip', '<b>' + nm(setter) + '</b> picked a card: <b>' + c.icon + ' ' + esc(c.name) + '</b>!'); if (Snd.pop) Snd.pop(); }
            startGoalPhase();
          });
          return;
        }
      }
      say('pip', wait(G.setter, 'set the Goal')); renderGame();
    };
  });
  wrapG('nextTurn', function (orig) {
    return function () {
      if (!on() || !isHost() || G.phase !== 'move' || G.turn === 0) return orig();
      say('pip', wait(G.turn, 'move')); renderGame();
    };
  });
  wrapG('openGoalBuilder', function (orig) {
    return function (pi, onDone, noCancel) {
      if (!on() || !isHost() || pi === 0) return orig.apply(this, arguments);
      say('pip', wait(pi, 'build a Goal and a Solution')); renderGame();
      var tries = 0;
      (function again() {
        ask(pi, { k: 'goal', noCancel: !!noCancel, t: tries }, function (ans) {
          var toks = cubeTokens(ans && ans.tokens, 'goal'), g = toks && Eq.checkGoal(toks, G.fractions);
          if (g && g.ok) onDone(toks, g.value); else { tries++; again(); }
        });
      })();
    };
  });
  wrapG('openSolutionBuilder', function (orig) {
    return function (pi, mode, cb) {
      if (!on() || !isHost() || pi === 0) return orig.apply(this, arguments);
      say('pip', wait(pi, 'write a Solution')); renderGame();
      ask(pi, { k: 'sol', mode: mode }, function (ans) {
        var toks = ans && ans.tokens ? cubeTokens(ans.tokens, 'sol') : null;
        var chk = toks ? Eq.checkSolution(toks, solCtx(mode)) : null;
        cb(!!(chk && chk.ok), toks, chk || { reasons: [ans && ans.tokens ? 'That Solution could not be read.' : 'No Solution was written.'] });
      });
    };
  });
  wrapG('askNoGoal', function (orig) {
    return function (setter) {
      if (!on() || !isHost()) return orig(setter);
      O.noGoal = true;
      var other = idxs().filter(function (i) { return i !== setter; })[0];
      if (other === 0) { renderGame(); return orig(setter); }
      say('pip', wait(other, 'answer your “No Goal” call')); renderGame();
      ask(other, { k: 'nogoal' }, function (ans) { if (ans && ans.challenge) humanChallengesNoGoal(other, setter); else ACT.noGoalAgree(); });
    };
  });
  wrapG('lastCubePlayed', function (orig) {
    return function () {
      if (!on() || !isHost()) return orig();
      var mover = G.lastMover, other = idxs().filter(function (i) { return i !== mover; })[0];
      if (other === 0) return orig();
      G.phase = 'lastcheck';
      say('pip', 'The last cube is on the mat! ' + wait(other, 'decide: Impossible! or write a Solution'), 'think'); renderGame();
      ask(other, { k: 'last' }, function (ans) { if (ans && ans.imp) challenge('impossible', other); else startLastWrite(); });
    };
  });
  // Everybody writes at the same time: the other device is asked right away, not after this one finishes.
  wrapG('startLastWrite', function (orig) { return function () { if (on() && isHost()) remoteSeats().forEach(function (i) { ask(i, { k: 'sol', mode: 'last' }, null); }); return orig(); }; });
  wrapG('resolveChallenge', function (orig) { return function () { if (on() && isHost()) O.resultCh = JSON.parse(JSON.stringify(G.ch)); return orig.apply(this, arguments); }; });
  wrapG('endShake', function (orig) {
    return function (r) {
      if (on() && isHost()) {
        O.resultN++; O.noGoal = false;
        O.result = { n: O.resultN, mid: G.matchId, pts: r.pts, lines: r.lines, sols: r.sols || {}, ch: O.resultCh || null };
        O.resultCh = null;
      }
      return orig(r);
    };
  });
  // The next shake starts when BOTH players have read the results.
  wrapG('nextShake', function (orig) {
    return function () {
      if (!on() || !isHost() || !O.result || O.over) return orig();
      O.hostReady = O.result.n;
      var waiting = remoteSeats().filter(function (s) { return (O.ready[s] || 0) < O.result.n; });
      if (waiting.length) { say('pip', wait(waiting[0], 'finish reading the results')); renderGame(); save(); return; }
      return orig();
    };
  });
  wrapG('endMatch', function (orig) { return function () { if (on() && isHost()) { O.over = true; schedulePublish(); } return orig(); }; });

  // The guest's taps become messages to the host.
  wrapG('doMove', function (orig) {
    return function (id, zone) {
      if (!on() || !isGuest()) return orig(id, zone);
      var c = G.cubes[id];
      if (!humanTurn() || !c || c.zone !== 'resources' || c.locked || ['required', 'permitted', 'forbidden'].indexOf(zone) < 0) return;
      if (zone === 'forbidden' && zoneCubes('resources').length === 1) { say('pip', 'The very last cube can\'t go to Forbidden. Put it in <b>Required</b> or <b>Permitted</b>!', 'think'); Snd.boop(); return; }
      G.selected = null; c.zone = zone; c.order = 1e9 + O.n; G.justMoved = id; G.turn = 1; // shown at once; the host's state confirms it
      if (!T3.active()) Snd.thunk();
      send({ a: 'move', id: id, zone: zone });
      say('pip', pick(['Nice move!', 'Good thinking!', 'Thunk! Placed.', 'Ooh, interesting!']), 'happy');
      renderGame();
    };
  });
  function guestChallenge(kind) {
    if (G.lastMover === null || G.lastMover === 0) { say('pip', 'There is no move to challenge yet.'); return; }
    if (!canChallengeNowish(0)) return;
    if (kind === 'now') { var why = nowCheckFor(0); if (why) { say('pip', why, 'think'); Snd.boop(); return; } }
    G.busy = true; send({ a: 'ch', kind: kind }); renderGame();
  }
  wrapA('callNow', function (orig) { return function (el) { if (on() && isGuest()) return guestChallenge('now'); return orig(el); }; });
  wrapA('callImp', function (orig) { return function (el) { if (on() && isGuest()) return guestChallenge('impossible'); return orig(el); }; });
  wrapA('buildGoal', function (orig) {
    return function () {
      if (!on()) return orig();
      if (G.phase !== 'goal' || G.setter !== 0) return;
      if (isHost()) return orig();
      openGoalBuilder(0, function (tokens) { G.busy = true; send({ a: 'goal', tokens: tokens }); renderGame(); });
    };
  });
  wrapA('noGoal', function (orig) {
    return function () {
      if (!on()) return orig();
      if (isGuest()) { if (G.phase === 'goal' && G.setter === 0 && !G.busy) { G.busy = true; O.ng = true; send({ a: 'nogoal' }); guestSpeech(O.state || {}); renderGame(); } return; }
      if (G.setter !== 0 && O.acting !== G.setter) return;
      return orig();
    };
  });
  wrapA('cubeTap', function (orig) { return function (el) { if (on() && G && !humanTurn() && !(G.cubes[+el.dataset.id] || {}).locked) return; return orig(el); }; });
  wrapA('hint', function (orig) { return function () { var r = orig(); if (on() && isGuest() && G && G.hintUsed) { O.hint[G.matchId + '.' + G.rollNo] = true; save(); } return r; }; });
  wrapA('emote', function (orig) {
    return function (el) {
      if (!on()) return orig(el);
      var now = Date.now(); if (now - (O.lastEmote || 0) < 3000) return; O.lastEmote = now;
      orig(el);
      var id = el && el.dataset ? el.dataset.arg : '';
      if (isGuest()) send({ a: 'emote', id: id });
      else { O.emote = { seat: 0, id: id, n: ++O.emoteN }; schedulePublish(); }
    };
  });
  // Leaving on purpose (Menu → Leave, the end-of-match Menu button, "End the match").
  wrapA('reallyQuit', function (orig) { return function () { if (on() || O) leave(); return orig(); }; });
  wrapA('toMenu', function (orig) { return function () { if (on() || O) leave(); return orig(); }; });
  wrapA('rematch', function (orig) { return function () { if (on() && isGuest()) return ACT.olRematch(); return orig(); }; });
  // Coming back after a reload: the splash button goes straight back to the game.
  wrapA('start', function (orig) {
    return function () { var s = saved(); if (!s || !Net.available()) return orig(); Snd.init(); resume(s); };
  });
  if (saved() && Net.available()) { var tb = document.querySelector('#splash .tapgo'); if (tb) tb.lastChild.textContent = ' Back to my online game'; }

  // For testing in the browser console (two tabs with ?onlinetest=1&p=a / &p=b).
  window.TataOnline = { O: function () { return O; }, drop: function (v) { return Net.drop(v); }, saved: saved, state: function () { return O && O.state; } };

  return { setup: setup, setupCardHTML: setupCardHTML, on: on, isHost: isHost, isGuest: isGuest, leave: leave };
})();
