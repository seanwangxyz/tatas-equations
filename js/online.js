'use strict';
// ======================= ONLINE PLAY (two or three devices, one game) =======================
// Design (full write-up: docs/handoff/online.md):
//   - The HOST device is the referee. It runs the real game (G, js/game.js) like a pass-and-play match in mode
//     'online': player 0 = the host's player, then the guests' players (up to two), then maybe a creature the host
//     picked for the third seat. G.slots[i] says which room seat plays player i (0 = host, 1 / 2 = guests, -1 = creature).
//   - After every change the host publishes the whole game as one JSON string (rooms/CODE/state).
//   - A GUEST never runs game rules. It turns the host's state into a "mirror" G seen from its own seat (its player
//     becomes player 0, so the table, HUD and 3D kid are "me"), and renders it with the normal renderGame(). Its taps
//     become small action messages (rooms/CODE/acts/SEAT/N) that the host checks with the engine and applies.
//   - Whenever the game needs one guest's own private input (a Solution, a Goal for a "No Goal" challenge, a variation
//     card, "Impossible or write?" after the last cube, Third Party "write one too?", agreeing to "No Goal"), the host
//     puts a PROMPT for that player into the state; that guest opens its builder / pop-up and sends the answer back.
//     Nothing anybody writes is shown until the host reveals the shake's results to everyone.
//   - Prompt ids are built from the game position, so after a host reload the same question gets the same id and an
//     answer that already arrived is used again. The host saves its game to localStorage at every publish.
//   - Nobody is ever timed out: a missing player gets a calm "lost connection: waiting…" line. The host may let a
//     creature play for a guest who left (they take their seat back at the next shake when they return).
//   - After a match: "Play again" for everyone in the room (each taps ready, the host starts, the first Goal-setter
//     moves round), or "Leave".
//
// Hooks: js/game.js has three one-line changes (startMatch -> Online.setup, the jersey in renderGame, and 'online'
// counting as a pass-and-play shake in endShake). Everything else is wrapped from this file and every wrapper calls
// the original unchanged unless an online match is on (G.mode === 'online').
var Online = (function () {
  var WORDS = ['ANT', 'APE', 'BAT', 'BEAR', 'BEE', 'BIRD', 'BUG', 'CAT', 'COW', 'CRAB', 'DEER', 'DOG', 'DUCK', 'EEL', 'ELK', 'EMU', 'FISH', 'FOX', 'FROG',
    'GOAT', 'HEN', 'LION', 'MOLE', 'MOOSE', 'MOUSE', 'OWL', 'PIG', 'PONY', 'PUG', 'SEAL', 'SLOTH', 'SWAN', 'TIGER', 'TOAD', 'WOLF', 'YAK', 'ZEBRA',
    'APPLE', 'BALL', 'BOAT', 'CAKE', 'DRUM', 'KITE', 'LEMON', 'MANGO', 'MOON', 'PEAR', 'PLUM', 'ROCK', 'SHIP', 'SOCK', 'STAR', 'SUN', 'TACO',
    'TRAIN', 'TRUCK', 'PIZZA', 'ROBOT', 'CLOUD', 'RAIN'];
  var SUFFIX = Net.test ? '.test.' + Net.profile : '';
  var KEY = 'tataOnline.session' + SUFFIX, LASTKEY = 'tataOnline.hosted' + SUFFIX;
  var ZONES = ['resources', 'goal', 'required', 'permitted', 'forbidden'];
  var PHASES = ['roll', 'goal', 'move', 'challenge', 'lastcheck', 'lastwrite', 'over'];
  var GUEST_SLOTS = [1, 2], MAXP = 3, ROOM_V = 2;
  var COLNAME = { red: 'Red', blue: 'Blue', green: 'Green', black: 'Black' };
  var ownStageInfo = window.stageInfo; // this device's own unlocks (stageInfo is wrapped below for the match)
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
  function cleanBack(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12); }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function grownUp() { return !!(S.set && S.set.me === 'tata'); }
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  // ---------------------------------------------------------------- saving the session (survives a reload)
  var HOST_KEEP = ['answers', 'ready', 'result', 'resultN', 'over', 'emoteN', 'seq', 'stage', 'stageSlot', 'hostReady', 'round', 'creature', 'bonus', 'sub', 'back', 'left', 'joinedAt'];
  var GUEST_KEEP = ['n', 'sid', 'sent', 'applied', 'acked', 'overShown', 'trailed', 'hint', 'rdy', 'seat'];
  function save() {
    if (!O) return;
    var s = { role: O.role, code: O.code, slot: O.slot, t: Date.now() };
    if (O.role === 'host') {
      HOST_KEEP.forEach(function (k) { s[k] = O[k]; });
      if (G && G.mode === 'online') { s.g = JSON.stringify(G, skipKeys); s.oc = orderCounter; }
    } else GUEST_KEEP.forEach(function (k) { s[k] = O[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function saved() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.code && Date.now() - (s.t || 0) < 24 * 3600 * 1000) return s; } catch (e) {} return null; }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function skipKeys(k, v) { return (k === 'speech' || k === 'aiPlan' || k === 'ai' || k === 'cfg') ? undefined : v; }

  // ---------------------------------------------------------------- checking what arrives from another device
  // Any symbol the engine knows a cube for (digits, + − × ÷ ^ √, the variation cards' turned / second-meaning
  // symbols, the bonus dice), plus the written-in '!' of the Factorial card.
  function symOK(s) { return typeof s === 'string' && s.length === 1 && (s === '!' || Eq.cubeOf(s) !== null); }
  function nCubes() { return G && G.cubes ? G.cubes.length : 24; }
  function safeTokens(list, n) {
    if (!Array.isArray(list)) return [];
    n = n || nCubes();
    return list.slice(0, 60).map(function (t) {
      if (t === '(' || t === ')' || t === '!') return t;
      if (t && typeof t === 'object' && symOK(t.s) && t.s !== '!' && t.id === (t.id | 0) && t.id >= -1 && t.id < n) return { s: t.s, id: t.id };
      return null;
    }).filter(function (t) { return t !== null; });
  }
  // Tokens a guest sent for a Goal or a Solution: every cube must be a real cube whose face that symbol uses.
  // (The engine then checks everything else: zones, Required, the card's rules, the value.)
  function cubeTokens(list, kind) {
    if (!Array.isArray(list) || !list.length || list.length > 60) return null;
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t === '(' || t === ')' || t === '!') { out.push(t); continue; }
      if (!t || typeof t !== 'object' || t.id !== (t.id | 0) || !symOK(t.s) || t.s === '!') return null;
      var c = G.cubes[t.id];
      if (!c || c.locked || Eq.cubeOf(t.s) !== c.s) return null;
      if (kind === 'goal' && (c.zone !== 'resources' || seen[t.id])) return null;
      seen[t.id] = 1; out.push({ s: t.s, id: t.id });
    }
    return out;
  }
  function cleanFrac(v) { return v && v.n === (v.n | 0) && v.d === (v.d | 0) && v.d > 0 ? { n: v.n, d: v.d } : null; }
  function cleanEx(ex) {
    if (!ex || typeof ex !== 'object') return null;
    var out = {};
    ['req', 'perm', 'res'].forEach(function (z) { out[z] = {}; var v = ex[z]; if (v && typeof v === 'object') Object.keys(v).forEach(function (d) { if (/^[0-9]$/.test(d)) out[z][d] = Math.max(0, Math.min(30, v[d] | 0)); }); });
    return out;
  }
  // A card's settings (Multiple of k, Base m, Exponent Colour), as plain checked data.
  function cleanSettings(s) {
    var out = {};
    if (!s || typeof s !== 'object') return out;
    if (s.k === (s.k | 0) && s.k >= 2 && s.k <= 99) out.k = s.k;
    if (s.base === (s.base | 0) && s.base >= 2 && s.base <= 10) out.base = s.base;
    if (Eq.COLORS.indexOf(s.ecol) >= 0) out.ecol = s.ecol;
    if (Array.isArray(s.eids)) out.eids = s.eids.filter(function (x) { return x === (x | 0) && x >= 0 && x < 40; }).slice(0, 40);
    var ex = cleanEx(s.ex); if (ex) out.ex = ex;
    return out;
  }
  // The math mode (fractions on/off, or a card with its settings and the Goal's symbols).
  function cleanMode(f) {
    if (!f || typeof f !== 'object') return !!f;
    var vars = Array.isArray(f.vars) ? f.vars.filter(function (v) { return typeof v === 'string' && Eq.VARIATIONS.indexOf(v) >= 0; }) : [];
    return Eq.mathMode(!!f.fractions, vars, Array.isArray(f.goal) ? f.goal.filter(symOK) : undefined, cleanSettings(f));
  }
  // The bonus Twist (G.twist): whatever shape js/bonus.js gives it, only short plain values travel.
  function cleanTwist(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
    var out = {};
    Object.keys(t).slice(0, 16).forEach(function (k) {
      if (!/^[a-zA-Z]{1,16}$/.test(k)) return;
      var v = t[k];
      if (v === null || typeof v === 'boolean' || (typeof v === 'number' && isFinite(v))) out[k] = v;
      else if (typeof v === 'string') out[k] = v.replace(/[\u0000-\u001f<>]/g, '').slice(0, 80);
    });
    if (own(out, 'f') && !(window.Bonus && Bonus.TWIST && out.f === (out.f | 0) && out.f >= 0 && out.f < Bonus.TWIST.length)) delete out.f;
    if (out.card != null && !(window.Vari && Vari.card(out.card))) out.card = null;
    return out;
  }
  function cleanStage(st) {
    try { st = typeof st === 'string' ? JSON.parse(st) : st; } catch (e) { return null; }
    if (!st || !Array.isArray(st.ops)) return null;
    var ops = Eq.OPS.filter(function (o) { return st.ops.indexOf(o) >= 0; });
    if (!ops.length) return null;
    var mg = +st.maxGoal; if (!(mg >= 5 && mg <= 999)) mg = 50;
    return { id: 'online', name: ops.map(show).join(' ') + (st.fractions ? ' and fractions' : ''), icon: '🌐', ops: ops, fractions: !!st.fractions, need: 0, maxGoal: mg };
  }
  // A small piece of HTML from the host (a result line, a creature's line): keep only the text and <b>.
  function cleanLine(html) {
    try {
      var doc = new DOMParser().parseFromString('<div>' + String(html).slice(0, 2000) + '</div>', 'text/html');
      var txt = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // (quotes stay plain: the 3D speech bubble shows them as text)
      var walk = function (n) { var out = ''; n.childNodes.forEach(function (c) { if (c.nodeType === 3) out += txt(c.textContent); else if (c.nodeType === 1) { var inner = walk(c); out += c.tagName === 'B' ? '<b>' + inner + '</b>' : inner; } }); return out; };
      return walk(doc.body.firstChild);
    } catch (e) { return esc(String(html).replace(/<[^>]*>/g, '')); }
  }
  // The kit a player wears (3D): only known keys with colour / word / on-off values.
  var KIT_COLOR = ['shirt', 'trim', 'trim2', 'shorts', 'hair', 'boots', 'armbandCol', 'socks'];
  var KIT_WORD = ['pattern', 'collar', 'sleeves', 'numStyle', 'crest', 'mark', 'hairStyle', 'celebrate'];
  var KIT_FLAG = ['frontNum', 'gloves', 'armband'];
  function cleanKit(k) {
    if (typeof k === 'string') { if (!k || k.length > 600) return null; try { k = JSON.parse(k); } catch (e) { return null; } }
    if (!k || typeof k !== 'object' || Array.isArray(k)) return null;
    var out = {}, n = 0;
    KIT_COLOR.forEach(function (key) { if (typeof k[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(k[key])) { out[key] = k[key]; n++; } });
    KIT_WORD.forEach(function (key) { if (typeof k[key] === 'string' && /^[a-zA-Z]{1,12}$/.test(k[key])) { out[key] = k[key]; n++; } });
    KIT_FLAG.forEach(function (key) { var v = k[key]; if (typeof v === 'boolean' || v === 'on' || v === 'off') { out[key] = v; n++; } });
    return n ? out : null;
  }
  function cleanLook(v) { v = v && typeof v === 'object' ? v : {}; return { who: v.who === 'tata' ? 'tata' : 'kid', back: cleanBack(v.back), kit: cleanKit(v.kit) }; }
  function cleanVC(s) {
    if (!window.Vari || typeof s !== 'string') return [];
    var seen = {};
    return s.split(',').slice(0, 30).filter(function (id) { if (seen[id] || !Vari.card(id)) return false; seen[id] = 1; return true; });
  }
  function myKit() { try { var c = cleanKit(window.Kit && Kit.current ? Kit.current() : S.kit); return c ? JSON.stringify(c) : ''; } catch (e) { return ''; } }
  // The variation cards this device's player has earned and Tata left switched on (offered when THEY set the Goal).
  function myVC() { if (!window.Vari) return ''; try { return Vari.unlocked().filter(function (c) { return Vari.cardOn(c.id); }).map(function (c) { return c.id; }).join(','); } catch (e) { return ''; } }
  function mySeatInfo() {
    var st = ownStageInfo(), g = grownUp();
    return { name: cleanName(S.name), jersey: cleanJersey(S.jersey), who: g ? 'tata' : 'kid', back: cleanBack(g ? S.name : (typeof backName === 'function' ? backName() : S.name)),
      kit: g ? '' : myKit(), vc: myVC(), stage: JSON.stringify({ ops: st.ops, fractions: !!st.fractions, maxGoal: st.maxGoal || 50 }), rdy: (O && O.rdy) || 0 };
  }
  function seatFrom(v) {
    if (!v || typeof v !== 'object') return null;
    return { name: cleanName(v.name), jersey: cleanJersey(v.jersey), look: cleanLook(v), vc: cleanVC(v.vc), stage: cleanStage(v.stage), rdy: Math.max(0, Math.min(1e5, +v.rdy || 0)) };
  }

  // ================================================================ HOST
  function hostGame() {
    saveIdentity();
    modal('<h2 class="hero">Host a game</h2><p class="ol-wait">Getting a game code…</p>');
    Net.init().then(function (uid) {
      return cleanOldRoom(uid).then(function () {
        var tries = 0;
        function attempt() {
          var code = WORDS[Math.floor(Math.random() * WORDS.length)] + (10 + Math.floor(Math.random() * 90));
          var room = { v: ROOM_V, host: uid, created: Net.stamp(), locked: false, seats: { 0: mySeatInfo() } };
          return Net.create('rooms/' + code, room).then(function (ok) {
            if (ok) return code;
            if (++tries > 6) throw new Error('no free code');
            return attempt();
          });
        }
        return attempt();
      }).then(function (code) {
        O = newHost(code, uid); try { localStorage.setItem(LASTKEY, code); } catch (e) {}
        save(); hostSubs(); lobbyHost();
      });
    }).catch(problem);
  }
  // A room this device hosted earlier and never closed (the app was just shut): delete it now.
  function cleanOldRoom(uid) {
    var c = null; try { c = localStorage.getItem(LASTKEY); localStorage.removeItem(LASTKEY); } catch (e) {}
    if (!c || !/^[A-Z]{3,6}[0-9]{2}$/.test(c)) return Promise.resolve();
    return Net.read('rooms/' + c + '/host').then(function (h) { if (h === uid) return Net.write('rooms/' + c, null); }).catch(function () {});
  }
  function newHost(code, uid) {
    return { role: 'host', code: code, slot: 0, seat: 0, uid: uid, subs: [], seats: {}, joinedAt: {}, prompts: {}, waiting: {}, answers: {}, ready: {}, result: null, resultN: 0,
      over: false, emote: null, emoteN: 0, acting: null, stage: null, stageSlot: 0, seq: 0, lastPub: '', seenActs: {}, hostReady: 0, resultCh: null, noGoal: false,
      goalWait: null, here: {}, round: 0, creature: -1, bonus: true, sub: {}, back: {}, left: {}, inLobby: false };
  }
  function hostSubs() {
    O.subs.push(Net.subscribe(base() + '/seats', onSeats));
    GUEST_SLOTS.forEach(function (s) { O.subs.push(Net.subscribe(base() + '/acts/' + s, function (v) { onActs(s, v); })); });
    O.subs.push(Net.presence(base() + '/here', 0, onPresence));
    watchConnection();
    voiceRoom(); // VOICE
  }
  function onSeats(v) {
    if (!O || O.role !== 'host') return;
    v = v || {};
    GUEST_SLOTS.forEach(function (s) {
      var info = seatFrom(v[s]);
      if (info && !O.seats[s] && O.joinedAt[s] === undefined) O.joinedAt[s] = O.round;
      if (!info && O.seats[s] && window.VoiceChat) VoiceChat.seatGone(s); // VOICE: a freed seat's talking notes go too
      if (info) O.seats[s] = info; else { delete O.seats[s]; delete O.joinedAt[s]; }
    });
    if (O.inLobby) lobbyHost();
    save();
  }
  function guestSlots() { return GUEST_SLOTS.filter(function (s) { return !!O.seats[s]; }); }
  // Ready for the next match: joined since the last match ended, or tapped "Play again".
  function slotReady(s) { var i = O.seats[s]; return !!i && (i.rdy >= O.round || (O.joinedAt[s] !== undefined && O.joinedAt[s] >= O.round)); }
  function stageKey(st) { return st ? st.ops.join() + (st.fractions ? 'f' : '') : ''; }
  function openCreatures() { return OPPONENTS.map(function (o, i) { return i; }).filter(function (i) { return typeof oppOpen !== 'function' || oppOpen(i); }); }
  // The lobby (before the first match, and again for "Play again"): who is here, a creature for the third seat,
  // whose cubes, the bonus dice, Kick off.
  function lobbyHost() {
    if (!O || O.role !== 'host' || (on() && !O.over)) return;
    var keepSel = $('#olCre'); if (keepSel) O.creature = +keepSel.value;
    O.inLobby = true;
    var gs = guestSlots(), ready = gs.filter(slotReady), here = O.here || {}, again = O.round > 0;
    var row = function (jersey, name, note, cls) { return '<div class="ol-seat' + (cls ? ' ' + cls : '') + '"><span class="jersey">' + esc(jersey) + '</span><b>' + esc(name) + '</b><small>' + note + '</small></div>'; };
    var rows = row(cleanJersey(S.jersey), cleanName(S.name), 'you, the host', 'ok');
    gs.forEach(function (s) {
      var i = O.seats[s], away = !here[s];
      rows += row(i.jersey, i.name, away ? 'not connected right now' : slotReady(s) ? (again ? '✔ ready to play again' : '✔ joined') : 'still reading the results…', slotReady(s) && !away ? 'ok' : 'wait');
    });
    var free = MAXP - 1 - gs.length;
    var canCre = ready.length === 1 && gs.length === 1, cres = openCreatures();
    if (free > 0 && !canCre) rows += '<div class="ol-seat empty"><small>Waiting for ' + (gs.length ? 'a third player (optional)' : 'the other player') + '… They tap <b>Online</b>, then <b>Join a game</b>, and type the code.</small></div>';
    if (canCre) {
      if (O.creature >= 0 && cres.indexOf(O.creature) < 0) O.creature = -1;
      rows += '<div class="ol-seat cre"><label for="olCre">Third seat:</label><select id="olCre"><option value="-1">nobody (2 players)' + (free > 0 ? ', or a third person joins' : '') + '</option>' +
        cres.map(function (i) { return '<option value="' + i + '"' + (O.creature === i ? ' selected' : '') + '>' + OPPONENTS[i].emoji + ' ' + esc(OPPONENTS[i].name) + ' (creature)</option>'; }).join('') + '</select></div>';
    }
    // whose cubes (only when the players have different operations unlocked)
    var stages = [{ slot: 0, who: cleanName(S.name), st: ownStageInfo() }].concat(gs.map(function (s) { return { slot: s, who: O.seats[s].name, st: O.seats[s].stage }; }).filter(function (x) { return x.st; }));
    var distinct = []; stages.forEach(function (x) { if (!distinct.some(function (y) { return stageKey(y.st) === stageKey(x.st); })) distinct.push(x); });
    if (!stages.some(function (x) { return x.slot === O.stageSlot; })) O.stageSlot = 0;
    var chosenKey = stageKey((stages.filter(function (x) { return x.slot === O.stageSlot; })[0] || stages[0]).st);
    var picks = distinct.length > 1 ? '<p class="ol-q">Which operations should the cubes have?</p><div class="ol-picks">' + distinct.map(function (x) {
      return '<button class="ol-pick' + (stageKey(x.st) === chosenKey ? ' on' : '') + '" data-act="olStage" data-arg="' + x.slot + '"><b>' + esc(x.who) + '\'s cubes</b><span>' + esc(x.st.ops.map(show).join('  ')) + (x.st.fractions ? ' and fractions' : '') + '</span></button>';
    }).join('') + '</div>' : '';
    var dice = (window.Bonus && Bonus.ORDER) ? Bonus.ORDER.filter(function (id) { try { return Bonus.dieOn(id); } catch (e) { return false; } }) : [];
    var bonusRow = dice.length ? '<div class="ol-opt"><span>🎲 Bonus dice from this device (' + esc(dice.map(function (id) { return Bonus.DIE[id].short; }).join(', ')) + ')</span><button class="btn small' + (O.bonus ? ' green' : '') + '" data-act="olBonus">' + (O.bonus ? '✔ On' : 'Off') + '</button></div>' : '';
    modal('<h2 class="hero">' + ico('people') + ' ' + (again ? 'Play again?' : 'Your game code') + '</h2>' +
      (again ? '<p class="ol-codeline">Game code <b>' + esc(prettyCode(O.code)) + '</b></p>' : '<div class="ol-code" aria-label="Game code">' + esc(prettyCode(O.code)) + '</div>' +
        '<div class="row ol-share"><button class="btn small" data-act="olShare">' + ico('people') + ' Share the code</button></div>' +
        '<p style="text-align:center">Read this code to the other players (one or two). They tap <b>Online</b>, then <b>Join a game</b>, and type it in.</p>') +
      '<div class="ol-seats">' + rows + '</div>' + picks + bonusRow +
      '<p style="text-align:center;font-size:16px">' + (S.set.shakes || 3) + ' shakes.' + (window.VoiceChat ? '' : ' Talk on FaceTime while you play!') + '</p>' + voiceLobby() + // VOICE: the talking block

      '<div class="row"><button class="btn green big" data-act="olKick"' + (ready.length ? '' : ' disabled') + '>' + ico('play') + ' ' + (again ? 'Start the next match!' : 'Kick off!') + '</button><button class="btn" data-act="olCancel">' + (again ? 'Leave' : 'Cancel') + '</button></div>');
    var sel = $('#olCre'); if (sel) sel.onchange = function () { if (O) { O.creature = +sel.value; save(); } };
  }
  ACT.olStage = function (el) { if (!O) return; O.stageSlot = +el.dataset.arg || 0; Snd.click(); lobbyHost(); };
  ACT.olBonus = function () { if (!O) return; O.bonus = !O.bonus; Snd.click(); save(); lobbyHost(); };
  ACT.olShare = function () {
    if (!O) return;
    var text = 'Come and play Tata\'s Equations with me! Tap Online, then Join a game, and type the code ' + prettyCode(O.code);
    var done = function () { toast('Copied! Paste it in a message.'); };
    try {
      if (navigator.share && window.matchMedia && matchMedia('(pointer: coarse)').matches) { navigator.share({ text: text }).catch(function () {}); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () { toast('The code is <b>' + esc(prettyCode(O.code)) + '</b>'); }); return; }
    } catch (e) {}
    toast('The code is <b>' + esc(prettyCode(O.code)) + '</b>');
  };
  ACT.olKick = function () {
    if (!O || O.role !== 'host') return;
    var sel = $('#olCre'); if (sel) O.creature = +sel.value;
    var gs = guestSlots().filter(slotReady);
    if (!gs.length) return;
    var me = mySeatInfo();
    var seats = [{ slot: 0, name: cleanName(S.name), jersey: cleanJersey(S.jersey), look: cleanLook(me) }];
    gs.forEach(function (s) { var i = O.seats[s]; seats.push({ slot: s, name: i.name, jersey: i.jersey, look: i.look }); });
    if (seats.length < MAXP && O.creature >= 0 && OPPONENTS[O.creature]) seats.push({ creature: O.creature });
    var stSeat = O.stageSlot ? O.seats[O.stageSlot] : null;
    var cfg = { seats: seats, stage: stSeat && stSeat.stage ? stSeat.stage : null, bonus: O.bonus, firstSetter: O.round % seats.length };
    O.inLobby = false;
    Net.write(base() + '/locked', true);
    closeModal(); hideBanner();
    drainQueue(function () { if (O) startMatch('online', null, cfg); });
  };
  // Called from startMatch (js/game.js) for mode 'online'.
  function setup(g, cfg) {
    cfg = cfg || {};
    var seats = Array.isArray(cfg.seats) && cfg.seats.length >= 2 ? cfg.seats.slice(0, MAXP) : [{ slot: 0 }, { slot: 1, name: 'Tata' }];
    var p0 = g.players[0];
    p0.jersey = cleanJersey(seats[0].jersey || S.jersey); p0.look = cleanLook(seats[0].look || mySeatInfo()); p0.slot = 0;
    seats.slice(1).forEach(function (s) {
      if (s.creature >= 0 && OPPONENTS[s.creature]) { var o = OPPONENTS[s.creature]; g.players.push({ name: o.name, ai: o, aiIdx: s.creature, score: 0, list: [], slot: -1 }); }
      else g.players.push({ name: cleanName(s.name || 'Tata'), ai: null, score: 0, list: [], jersey: cleanJersey(s.jersey), look: cleanLook(s.look), slot: s.slot | 0 });
    });
    g.slots = g.players.map(function (p) { return p.slot; });
    var n = g.players.length;
    g.setter = (((cfg.firstSetter | 0) % n) + n) % n;
    g.matchId = rid(); g.rollNo = 0;
    if (O) {
      O.prompts = {}; O.waiting = {}; O.answers = {}; O.ready = {}; O.result = null; O.over = false; O.hostReady = 0; O.resultCh = null; O.noGoal = false;
      O.goalWait = null; O.sub = {}; O.back = {}; O.left = {}; O.avSig = null; O.inLobby = false;
      O.stage = cfg.stage || null; O.bonus = cfg.bonus !== false;
    }
  }

  // ---- publishing the game ----
  var pubTimer = null;
  function schedulePublish(force) { if (!O) return; if (force) O.force = true; if (pubTimer) return; pubTimer = setTimeout(function () { pubTimer = null; publish(); }, 0); }
  function publish() {
    if (!O || O.role !== 'host') return;
    var sp = (G && G.mode === 'online' && G.speech && G.speech.who === 'opp') ? String(G.speech.text).slice(0, 400) : null;
    var body = { g: (G && G.mode === 'online') ? JSON.parse(JSON.stringify(G, skipKeys)) : null, p: O.prompts, r: O.result, o: O.over, e: O.emote, ng: O.noGoal, gw: O.goalWait, rd: O.round, sp: sp };
    var s = JSON.stringify(body);
    if (s === O.lastPub && !O.force) return;
    O.force = false; O.lastPub = s; O.seq++;
    Net.write(base() + '/state', { seq: O.seq, g: s });
    save();
  }

  // ---- asking another device for its own input ----
  // cb(answer) runs when the answer arrives; sub() runs instead if a creature takes this player's seat meanwhile.
  function ask(seat, spec, cb, sub) {
    var id = [G.matchId, G.rollNo, spec.k, spec.mode || '', orderCounter, seat, spec.t || 0].join('.');
    spec.id = id;
    O.waiting[id] = { cb: cb || null, sub: sub || null, seat: seat };
    if (O.answers[id] !== undefined) setTimeout(function () { deliver(id); }, 0);
    else if (!O.prompts[seat] || O.prompts[seat].id !== id) O.prompts[seat] = spec;
    schedulePublish();
  }
  function deliver(id) {
    var w = O && O.waiting[id], ans = O && O.answers[id];
    if (!w || ans === undefined || !w.cb) return; // (asked early, "everybody writes": kept until the game reaches this player)
    delete O.waiting[id];
    schedulePublish();
    w.cb(ans);
  }
  function hasPrompt(seat) { return !!(O.prompts && O.prompts[seat]); }
  // The question is no longer needed (somebody else decided first).
  function withdraw(seat) {
    if (!O) return;
    delete O.prompts[seat];
    Object.keys(O.waiting).forEach(function (id) { if (O.waiting[id].seat === seat) delete O.waiting[id]; });
    schedulePublish();
  }
  // A creature takes this player's seat: open questions are answered the creature's way.
  function cancelSeat(seat) {
    delete O.prompts[seat];
    Object.keys(O.waiting).forEach(function (id) { var w = O.waiting[id]; if (w.seat !== seat) return; delete O.waiting[id]; if (w.sub) setTimeout(function () { if (on()) w.sub(); }, 0); });
    schedulePublish();
  }
  function remoteSeats() { return G ? idxs().filter(function (i) { return i !== 0 && !isAI(i); }) : []; }
  function seatOfSlot(slot) { return (G && G.mode === 'online' && Array.isArray(G.slots)) ? G.slots.indexOf(slot) : -1; }

  // ---- actions from the guests ----
  function onActs(slot, v) {
    if (!O || O.role !== 'host') return;
    v = v || {};
    var pre = slot + '.';
    Object.keys(O.seenActs).forEach(function (k) { if (k.indexOf(pre) === 0 && v[k.slice(pre.length)] == null) delete O.seenActs[k]; });
    Object.keys(v).filter(function (k) { return v[k] != null && /^[0-9]{1,9}$/.test(k); }).sort(function (a, b) { return a - b; }).forEach(function (k) {
      var raw = v[k];
      if (O.seenActs[pre + k] === raw) return;
      O.seenActs[pre + k] = raw;
      var a = null; try { a = typeof raw === 'string' && raw.length <= 4000 ? JSON.parse(raw) : null; } catch (e) {}
      Net.write(base() + '/acts/' + slot + '/' + k, null);
      if (a && typeof a === 'object') { try { handle(a, slot); } catch (e) { if (window.console) console.error('[online] action', a, e); } }
      if (O) schedulePublish(true);
    });
  }
  // Every action is checked against the host's own game first: never trust a message.
  function handle(a, slot) {
    if (a.a === 'leave') { guestLeft(slot); return; }
    var pi = seatOfSlot(slot);
    if (a.a === 'emote') {
      if (typeof a.id === 'string' && a.id.length <= 20) { showEmote(a.id); if (pi > 0) O.emote = { seat: pi, id: a.id, n: ++O.emoteN }; }
      return;
    }
    if (!on() || pi <= 0 || isAI(pi)) return;
    if (a.a === 'move') {
      if (G.phase === 'move' && G.turn === pi && !G.busy && !G.carrying) { O.acting = pi; try { doMove(a.id | 0, String(a.zone)); } finally { O.acting = null; } }
    } else if (a.a === 'ch' && (a.kind === 'now' || a.kind === 'impossible')) {
      if (G.phase === 'move' && G.lastMover !== null && G.lastMover !== pi && !G.carrying && (G.turn !== pi || !G.busy)) {
        O.acting = pi; try { ACT[a.kind === 'now' ? 'callNow' : 'callImp']({ dataset: { arg: String(pi) } }); } finally { O.acting = null; }
      }
    } else if (a.a === 'goal') {
      if (goalOK(pi)) { var toks = cubeTokens(a.tokens, 'goal'), g = toks && Eq.checkGoal(toks, G.fractions); if (g && g.ok) { O.goalWait = null; humanGoal(toks, g.value); } }
    } else if (a.a === 'nogoal') {
      if (goalOK(pi)) { O.goalWait = null; O.acting = pi; try { ACT.noGoal(); } finally { O.acting = null; } }
    } else if (a.a === 'ans' && typeof a.id === 'string') {
      var p = O.prompts[pi];
      if (p && p.id === a.id) { delete O.prompts[pi]; O.answers[a.id] = a; deliver(a.id); }
    } else if (a.a === 'ready') {
      O.ready[pi] = Math.max(O.ready[pi] || 0, a.n | 0);
      if (G.phase === 'over' && O.result && O.hostReady === O.result.n && !O.over) nextShake();
    }
  }
  function goalOK(pi) { return G.phase === 'goal' && G.setter === pi && O.goalWait === pi && !G.busy && !hasPrompt(pi) && !O.noGoal; }
  // A guest tapped Leave. In the lobby / after a match: their seat is freed. During a match the seat is kept for them
  // (same code to come back) and the host may let a creature play for them.
  function guestLeft(slot) {
    if (!O) return;
    var pi = seatOfSlot(slot);
    if (!on() || O.over || pi < 0) {
      delete O.seats[slot]; delete O.joinedAt[slot];
      Net.write(base() + '/seats/' + slot, null); Net.write(base() + '/guests/' + slot, null);
      if (O.inLobby) lobbyHost();
      save(); return;
    }
    if (isAI(pi)) return;
    O.left[slot] = true; save();
    toast('<b>' + nm(pi) + '</b> left the game.');
    refreshBanner(true);
  }
  // Which creature can play for a player who left: the first open creature not already at the table.
  function creatureFor() {
    var used = {}; idxs().forEach(function (i) { if (G.players[i].aiIdx != null) used[G.players[i].aiIdx] = 1; });
    var list = openCreatures().filter(function (i) { return !used[i]; });
    return list.length ? list[0] : -1;
  }
  function substitute(pi) {
    if (!on() || !isHost() || !(pi > 0) || !G.players[pi] || isAI(pi)) return;
    var k = creatureFor(); if (k < 0) return;
    var p = G.players[pi], o = OPPONENTS[k];
    p.ai = o; p.aiIdx = k; p.sub = true;
    if (G.act == null) G.act = pi;
    O.sub[p.slot] = true; delete O.back[p.slot];
    avatars();
    say('pip', '<b>' + esc(o.name) + '</b> plays for <b>' + esc(p.name) + '</b> until they come back!', 'happy');
    cancelSeat(pi);
    // pick the game up where it was waiting for this player
    if (G.phase === 'move' && G.turn === pi && !G.busy) setTimeout(function () { if (on() && G.turn === pi) nextTurn(); }, 300);
    else if (G.phase === 'goal' && G.setter === pi && O.goalWait === pi) { O.goalWait = null; G.busy = false; setTimeout(function () { if (on()) startGoalPhase(); }, 300); }
    else if (G.phase === 'over' && O.result && O.hostReady === O.result.n && !O.over) setTimeout(function () { if (on()) nextShake(); }, 300);
    refreshBanner(true); renderGame(); save();
  }
  ACT.olSub = function (el) { substitute(+el.dataset.arg); };
  // A player whose seat a creature took is back: from the next shake they play again.
  function returnSubs() {
    var changed = false;
    Object.keys(O.sub).forEach(function (k) {
      var slot = +k; if (!O.back[slot]) return;
      var pi = seatOfSlot(slot); if (pi < 0) return;
      var p = G.players[pi]; p.ai = null; delete p.aiIdx; delete p.sub;
      delete O.sub[slot]; delete O.back[slot]; delete O.left[slot];
      if (G.act === pi) { G.act = null; idxs().some(function (i) { if (isAI(i)) { G.act = i; return true; } return false; }); }
      toast('<b>' + esc(p.name) + '</b> is back in the game!');
      changed = true;
    });
    if (changed) avatars();
  }

  // ================================================================ GUEST
  function joinGame() {
    var code = (($('#olCode') || {}).value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    saveIdentity();
    if (!/^[A-Z]{3,6}[0-9]{2}$/.test(code)) { joinError('A code is a word and a number, like <b>FROG 47</b>.'); return; }
    var msg = $('#olJoinMsg'); if (msg) msg.innerHTML = 'Looking for the game…';
    Net.init().then(function (uid) {
      var r = 'rooms/' + code + '/';
      return Promise.all([Net.read(r + 'host'), Net.read(r + 'guests'), Net.read(r + 'locked'), Net.read(r + 'v'), Net.read(r + 'state')]).then(function (x) {
        var h = x[0], gs = x[1] || {}, locked = x[2] === true;
        if (!h) { joinError('No game has that code. Check it with the host and try again.'); return; }
        if (x[3] !== ROOM_V) { joinError('That game was made by an older copy of the game. Ask the host to reload the page and host again.'); return; }
        if (h === uid) { joinError('That\'s your own game! Join from another device.'); return; }
        var mine = GUEST_SLOTS.filter(function (s) { return gs[s] === uid; })[0];
        if (!mine && locked) { joinError('That game has already started. You can join when this match is over.'); return; }
        var order = mine ? [mine] : GUEST_SLOTS.filter(function (s) { return !gs[s]; });
        if (!order.length) { joinError('That game is full: three players are already in it.'); return; }
        var rd = 0; try { rd = (x[4] && typeof x[4].g === 'string') ? (JSON.parse(x[4].g).rd | 0) : 0; } catch (e) {}
        return claim(code, uid, order, 0, rd);
      });
    }).catch(problem);
  }
  function claim(code, uid, order, k, rd) {
    if (k >= order.length) { joinError('That game is full: three players are already in it.'); return; }
    var s = order[k];
    return Net.transaction('rooms/' + code + '/guests/' + s, function (cur) { return (cur === null || cur === uid) ? uid : undefined; }).then(function (ok) {
      if (!ok) return claim(code, uid, order, k + 1, rd);
      O = newGuest(code, uid, s); O.rdy = rd; // joining = ready for the next match
      return Net.write('rooms/' + code + '/seats/' + s, mySeatInfo()).then(function () { save(); guestSubs(); guestLobby(); });
    });
  }
  function joinError(html) { var m = $('#olJoinMsg'); if (m) m.innerHTML = '<span class="ol-err">' + html + '</span>'; Snd.boop(); }
  function newGuest(code, uid, slot) {
    return { role: 'guest', code: code, slot: slot, seat: 1, uid: uid, subs: [], sid: rid(), n: 0, sent: {}, open: null, applied: 0, acked: 0, overShown: null, state: null,
      pouring: false, carry: false, animated: '', poured: '', hint: {}, trailed: false, vsFor: null, resultOpen: 0, here: {}, lastEmote: 0, seats: {}, rdy: 0, gw: false,
      ng: false, inLobby: false, rmWait: false, spect: null };
  }
  function guestSubs() {
    O.subs.push(Net.subscribe(base() + '/state', onState));
    O.subs.push(Net.subscribe(base() + '/host', function (h) { if (O && O.role === 'guest' && h === null) ended(); }));
    O.subs.push(Net.subscribe(base() + '/seats', function (v) {
      if (!O || O.role !== 'guest') return;
      O.seats = {}; [0, 1, 2].forEach(function (s) { var i = seatFrom(v && v[s]); if (i) O.seats[s] = i; });
      if (O.inLobby) guestLobby(); else if (O.rmWait) rematchWait();
    }));
    O.subs.push(Net.presence(base() + '/here', O.slot, onPresence));
    watchConnection();
    voiceRoom(); // VOICE
  }
  function roomList(readyFor) {
    return '<div class="ol-seats">' + [0, 1, 2].filter(function (s) { return O.seats[s]; }).map(function (s) {
      var i = O.seats[s], note = s === 0 ? 'the host' : s === O.slot ? 'you' : 'joined';
      if (readyFor !== undefined && s !== 0) note = (i.rdy >= readyFor ? '✔ ready' : 'deciding…') + (s === O.slot ? ' (you)' : '');
      return '<div class="ol-seat ok"><span class="jersey">' + esc(i.jersey) + '</span><b>' + esc(i.name) + '</b><small>' + note + '</small></div>';
    }).join('') + '</div>';
  }
  function hostName() { return O && O.seats[0] ? esc(O.seats[0].name) : 'the host'; }
  function guestLobby() {
    if (!O || O.role !== 'guest' || on()) return;
    O.inLobby = true;
    modal('<h2 class="hero">' + ico('people') + ' You joined!</h2>' + roomList() + '<p class="ol-wait">Waiting for <b>' + hostName() + '</b> to kick off…</p>' + voiceLobby() + /* VOICE */ '<div class="row"><button class="btn" data-act="olCancel">Leave</button></div>');
  }
  function send(act) {
    if (!O) return;
    act.sid = O.sid; O.n++; save();
    Net.write(base() + '/acts/' + O.slot + '/' + O.n, JSON.stringify(act));
  }
  function writeSeat() { if (O && O.role === 'guest') { try { Net.write(base() + '/seats/' + O.slot, mySeatInfo()); } catch (e) {} } }
  function onState(v) {
    if (!O || O.role !== 'guest' || !v || typeof v.g !== 'string' || v.g.length > 200000) return;
    var st; try { st = JSON.parse(v.g); } catch (e) { return; }
    if (!st || typeof st !== 'object') return;
    O.state = st; O.rd = st.rd | 0;
    if (O.pouring || O.carry) return; // after the vs screen / pour / a carried cube
    apply(st);
  }
  function rot(i) { if (i === null || i === undefined || !G) return null; var n = G.players.length; return ((i - O.seat) % n + n) % n; }
  function okHost(h) {
    if (!h || !Array.isArray(h.cubes) || h.cubes.length < 24 || h.cubes.length > 32 || !Array.isArray(h.players) || h.players.length < 2 || h.players.length > MAXP) return false;
    if (!Array.isArray(h.slots) || h.slots.length !== h.players.length) return false;
    return h.cubes.every(function (c, i) {
      if (!c || c.id !== i || typeof c.color !== 'string' || !own(Eq.CUBE_FACES, c.color)) return false;
      var official = Eq.COLORS.indexOf(c.color) >= 0;
      return (i < 24 ? official : !official) && Eq.CUBE_FACES[c.color].indexOf(c.s) >= 0 && ZONES.indexOf(c.zone) >= 0;
    });
  }
  // The host's game, seen from this device's seat.
  function mirror(h) {
    var n = h.players.length, me = O.seat, players = [];
    var R = function (i) { return (i !== (i | 0) || i < 0 || i >= n) ? null : ((i - me) % n + n) % n; };
    for (var k = 0; k < n; k++) {
      var p = h.players[(k + me) % n] || {}, ai = (p.aiIdx === (p.aiIdx | 0) && OPPONENTS[p.aiIdx]) ? OPPONENTS[p.aiIdx] : null;
      players.push({ name: cleanName(p.name), ai: ai, aiIdx: ai ? p.aiIdx : undefined, score: +p.score || 0, list: (Array.isArray(p.list) ? p.list : []).slice(0, 60).map(function (x) { return +x || 0; }),
        jersey: cleanJersey(p.jersey), look: cleanLook(p.look), slot: h.slots[(k + me) % n] | 0 });
    }
    var ch = h.ch && typeof h.ch === 'object' && R(h.ch.challenger) !== null && R(h.ch.mover) !== null ? { kind: h.ch.kind === 'now' ? 'now' : 'impossible', challenger: R(h.ch.challenger), mover: R(h.ch.mover), tp: R(h.ch.tp) } : null;
    var cubes = h.cubes.map(function (c) { return { id: c.id, color: c.color, s: c.s, zone: c.zone, order: +c.order || 0, locked: !!c.locked }; });
    var vari = (window.Vari && typeof h.vari === 'string' && Vari.card(h.vari)) ? h.vari : null;
    var act = R(h.act);
    return { mode: 'online', matchId: String(h.matchId).slice(0, 24), shakes: h.shakes | 0, shake: h.shake | 0, setter: R(h.setter), players: players, slots: players.map(function (p) { return p.slot; }),
      cubes: cubes, goalTokens: safeTokens(h.goalTokens, cubes.length), goal: cleanFrac(h.goal), lastMover: R(h.lastMover), turn: R(h.turn),
      phase: PHASES.indexOf(h.phase) >= 0 ? h.phase : 'roll', rolling: !!h.rolling, busy: false, carrying: false, ch: ch,
      ops: Array.isArray(h.ops) ? h.ops.filter(function (o) { return Eq.OPS.indexOf(o) >= 0; }) : [], fractions: cleanMode(h.fractions),
      vari: vari, variSet: vari ? cleanSettings(h.variSet) : null, variDone: !!h.variDone, twist: cleanTwist(h.twist),
      act: act !== null && players[act].ai ? act : null, rollNo: h.rollNo | 0, trailed: !!O.trailed, cfg: null };
  }
  function apply(st) {
    var h = st.g;
    if (!h) return;          // still in the lobby
    if (!okHost(h)) { if (window.console) console.warn('[online] state refused'); return; }
    var mySeat = h.slots.indexOf(O.slot);
    if (mySeat < 0) { spectator(st, h); return; }
    var fresh = !G || G.mode !== 'online' || G.matchId !== String(h.matchId).slice(0, 24) || O.seat !== mySeat;
    O.seat = mySeat;
    var m = mirror(h), prev = null;
    if (fresh) {
      G = m; G.selected = null; G.highlight = null; G.speech = null; G.hintUsed = false; G.justMoved = null;
      O.emoteSeen = st.e ? st.e.n : 0; // don't replay an old emote after a reload
      O.spect = null; O.animated = '';
      startMirror();
      if (O.vsFor !== G.matchId && h.phase === 'roll' && h.shake === 1 && window.Social && Social.vsScreen) {
        O.vsFor = G.matchId; O.pouring = true;
        Social.vsScreen(G.players, function () { if (!O) return; O.pouring = false; if (O.state) apply(O.state); });
        renderGame(); return;
      }
      O.vsFor = G.matchId;
    } else {
      prev = { phase: G.phase, goal: G.goal, zones: G.cubes.map(function (c) { return c.zone; }), vari: G.vari, rollNo: G.rollNo, ch: G.ch, setter: G.setter, twist: JSON.stringify(G.twist || null), n: G.cubes.length };
      var keep = { selected: G.selected, highlight: G.highlight, speech: G.speech };
      Object.keys(m).forEach(function (k) { G[k] = m[k]; });
      G.selected = keep.selected; G.highlight = keep.highlight; G.speech = keep.speech;
    }
    var rk = G.matchId + '.' + G.rollNo;
    G.hintUsed = !!O.hint[rk];
    O.gw = st.gw === mySeat;
    O.ng = !!st.ng;
    if (G.selected != null && (!G.cubes[G.selected] || G.cubes[G.selected].zone !== 'resources' || G.turn !== 0)) G.selected = null;
    if (G.highlight != null && (!G.cubes[G.highlight] || G.cubes[G.highlight].zone !== 'resources')) G.highlight = null;
    avatars();
    // A new roll: the cup pours on this device too (the faces it lands on are replaced by the host's).
    if (G.phase === 'roll' && G.rolling && O.poured !== rk) {
      O.poured = rk; xpLog = []; cue('reset'); board(''); Snd.setMood('play');
      if (window.Vari) Vari.chip();
      if (window.Bonus && Bonus.chip) Bonus.chip();
      if (T3.active()) {
        O.pouring = true; renderGame();
        T3.pour(G.cubes, function () { if (!O) return; O.pouring = false; G.rolling = false; if (O.state) apply(O.state); });
        return;
      }
      Snd.clatter();
    }
    if (G.phase === 'roll' && G.rolling && T3.active()) { guestSpeech(st); return; } // our pour is done; the host's faces are on the way
    if (prev && prev.n === G.cubes.length && carryMove(prev, st)) return;
    if (prev) effects(prev, st);
    prompts(st);
    if (st.r && st.r.mid === G.matchId && st.r.n > O.acked && G.phase === 'over' && O.resultOpen !== st.r.n && !O.open) showResult(st.r);
    if (st.o && O.overShown !== G.matchId && O.acked >= (st.r ? st.r.n : 0) && !O.open) showEnd();
    else if (st.o && fresh && !O.open) { if (O.rdy >= (st.rd | 0)) rematchWait(); else endChoice(); }
    if (st.e && st.e.seat !== mySeat && st.e.n > (O.emoteSeen || 0)) { O.emoteSeen = st.e.n; showEmote(st.e.id); }
    guestSpeech(st);
    renderGame();
    refreshBanner();
  }
  // Another player's move, seen in 3D: their person (or creature) carries the cube over before it lands.
  function carryMove(prev, st) {
    if (!T3.active()) return false;
    var moved = null, n = 0;
    G.cubes.forEach(function (c, i) { if (prev.zones[i] === 'resources' && ['required', 'permitted', 'forbidden'].indexOf(c.zone) >= 0) { moved = c; n++; } });
    if (n !== 1 || G.lastMover === null) return false;
    var key = G.matchId + '.' + G.rollNo + '.' + moved.id;
    if (O.animated === key) return false;
    var fn = carrierFor(G.lastMover);
    if (!fn) return false;
    O.animated = key;
    var zone = moved.zone, id = moved.id;
    moved.zone = 'resources'; G.busy = true; G.carrying = true; O.carry = true;
    renderGame();
    var done = false;
    fn(id, zone, function () { if (done || !O) return; done = true; O.carry = false; if (O.state) apply(O.state); });
    return true;
  }
  function carrierFor(who) {
    if (!G || !G.players[who]) return null;
    if (who === 0) return T3.playerMove || null;
    if (isAI(who)) { if (!T3.creatureMove) return null; return function (id, zone, done) { if (T3.creatureUse) T3.creatureUse(aiSeat(who)); T3.creatureMove(id, zone, done); }; }
    return (mateSeat() === who && T3.mateMove) ? T3.mateMove : null;
  }
  function startMirror() {
    closeModal(); $('#builder').classList.remove('on'); B = null; O.open = null; O.resultOpen = 0; O.inLobby = false; O.rmWait = false;
    go('game'); Snd.setMood('play'); playerShow(); xpLog = []; O.avSig = null;
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
    if (prev.twist !== JSON.stringify(G.twist || null) && window.Bonus && Bonus.chip) {
      Bonus.chip(!!G.twist);
      if (G.twist && G.twist.name) { banner('🌀 TWIST!', G.twist.name); board('TWIST' + String.fromCharCode(10) + String(G.twist.name).toUpperCase()); if (Snd.pop) Snd.pop(); }
    }
  }
  // Somebody else is answering a question right now: "Waiting for Mama to …".
  var PROMPT_WHAT = { sol: 'write a Solution', goal: 'build a Goal and a Solution', vari: 'pick a variation card', nogoal: 'answer the “No Goal” call',
    last: 'decide: Impossible! or write a Solution', tp: 'decide whether to write a Solution too' };
  function promptWait(st) {
    if (!st.p || typeof st.p !== 'object') return null;
    var keys = Object.keys(st.p);
    for (var j = 0; j < keys.length; j++) {
      var x = +keys[j], p = st.p[keys[j]];
      if (!(x >= 0 && x < G.players.length) || !p || !PROMPT_WHAT[p.k]) continue;
      var r = rot(x); if (r === 0) continue;
      return { who: r, line: wait(r, PROMPT_WHAT[p.k]) };
    }
    return null;
  }
  function guestSpeech(st) {
    var p = st.p && st.p[O.seat], pending = p && !O.sent[p.id], line = '', who = null, hostI = rot(0);
    var pw = promptWait(st);
    if (G.phase === 'roll') line = 'Rolling the cubes…';
    else if (pending) line = { sol: 'Write your Solution!', goal: 'Build a Goal, then a Solution for it, using any Resource cubes!', tp: 'You are the Third Party: you may write a Solution too.',
      last: 'The last cube is on the mat!', nogoal: 'Is a Goal possible? You decide!', vari: 'You set the Goal: pick a variation card, or no card.' }[p.k] || 'Your turn to choose!';
    else if (G.phase === 'goal') {
      if (G.setter === 0) line = O.ng ? 'You said <b>No Goal</b>. ' + (pw ? pw.line : 'Waiting for the others to answer…') : O.gw ? 'You rolled the cubes, so you set the <b>Goal</b>! Use 1 to 6 cubes. Two digit cubes side by side make a two-digit number, like 2 and 4 → 24.' : 'Getting ready for your Goal…';
      else if (pw) { line = pw.line; who = pw.who; }
      else { who = G.setter; line = wait(G.setter, 'set the Goal'); }
    } else if (G.phase === 'move') {
      if (G.turn === 0) line = zoneCubes('resources').length === 1 ? 'Your turn. Only ONE cube left! Move it to <b>Required</b> or <b>Permitted</b>, or call <b>Impossible!</b> if no Solution can be made.' : 'Your turn! Tap a Resource cube, then tap a section. Or, if you spot something, challenge: <b>Now!</b> or <b>Impossible!</b>';
      else { who = G.turn; line = wait(G.turn, 'move') + (G.players.length > 2 && G.lastMover !== null && G.lastMover !== 0 ? ' You can challenge too!' : ''); }
    } else if (G.phase === 'challenge' && G.ch) {
      var w = G.ch.kind === 'now' ? G.ch.challenger : G.ch.mover;
      if (pw) { line = pw.line; who = pw.who; }
      else if (w === 0 || G.ch.tp === 0) line = 'Your answer is in! The result is coming…';
      else { who = w; line = wait(w, 'write a Solution'); }
    } else if (G.phase === 'lastcheck') line = 'The last cube is on the mat! ' + (pw ? pw.line : 'Waiting for everybody to decide…');
    else if (G.phase === 'lastwrite') line = 'Everybody writes a Solution! ' + (pw ? pw.line : wait(hostI, 'finish writing'));
    else if (G.phase === 'over') line = (st.r && O.acked >= st.r.n && !st.o) ? 'Waiting for everybody to finish reading the results…' : 'Shake over!';
    if (who !== null && isAI(who) && typeof st.sp === 'string' && st.sp) { var t = cleanLine(st.sp); if (!G.speech || G.speech.text !== t) say('opp', t); return; }
    if (line && (!G.speech || G.speech.text !== line)) say('pip', line);
  }
  // Questions for this device (its own Solution, card, choice). Opened once per question.
  function prompts(st) {
    var p = st.p && st.p[O.seat];
    if (O.open && (!p || p.id !== O.open)) { // the host withdrew the question (it moved on)
      O.open = null; pendingP = null; $('#builder').classList.remove('on'); B = null; closeModal();
    }
    if (!p || typeof p.id !== 'string' || O.sent[p.id] || O.open === p.id) return;
    O.open = p.id;
    if (p.k === 'sol') openSolutionBuilder(0, ['now', 'impossible', 'last', 'free'].indexOf(p.mode) >= 0 ? p.mode : 'last', function (ok, tokens) { answer(p, { tokens: tokens || null }); });
    else if (p.k === 'goal') openGoalBuilder(0, function (tokens) { answer(p, { tokens: tokens }); }, true);
    else if (p.k === 'vari' && window.Vari) variPrompt(p);
    else if (p.k === 'nogoal') {
      pendingP = p;
      var sn = rot(p.setter | 0);
      modal('<h2>🤷 No Goal?</h2><p style="text-align:center"><b>' + nm(sn === null ? 1 : sn) + '</b> says no Goal can be made with these cubes. Do you agree?</p>' +
        '<div class="row"><button class="btn green" data-act="olAns" data-arg="agree">I agree</button><button class="btn now" data-act="olAns" data-arg="challenge">Challenge! I can make one</button></div>');
    } else if (p.k === 'last') {
      pendingP = p;
      modal('<h2 class="hero">Last cube played!</h2><p style="text-align:center">If you think NOBODY can make the Goal now, call Impossible! Otherwise everybody writes a Solution (4 points if correct, 2 if not).</p>' +
        '<div class="row"><button class="btn imp" data-act="olAns" data-arg="imp">' + ico('ban') + ' Impossible!</button><button class="btn green" data-act="olAns" data-arg="write">' + ico('pencil') + ' Let\'s write!</button></div>');
    } else if (p.k === 'tp') {
      pendingP = p;
      var kind = p.kind === 'now' ? 'now' : 'impossible';
      modal('<h2 class="hero">You are the Third Party</h2><p style="text-align:center">You may write a Solution too, but you don\'t have to.</p>' +
        '<ul class="reasons" style="background:#e7f5ff"><li>Write a correct one: you score <b>4 or 6</b>.</li><li>Write a wrong one: you score <b>2</b>.</li><li>Skip it: you score by who turns out to be right' + (kind === 'impossible' ? ' (4 if Impossible was right)' : ' (6 if the Now! Solution is wrong)') + '.</li></ul>' +
        '<div class="row"><button class="btn green" data-act="olAns" data-arg="yes">' + ico('pencil') + ' I\'ll write one</button><button class="btn" data-act="olAns" data-arg="no">No thanks</button></div>');
    } else O.open = null;
  }
  var pendingP = null;
  ACT.olAns = function (el) {
    var p = pendingP, v = el.dataset.arg; pendingP = null; closeModal();
    if (!p || !O) return;
    if (p.k === 'nogoal') answer(p, { challenge: v === 'challenge' });
    else if (p.k === 'last') answer(p, { imp: v === 'imp' });
    else if (p.k === 'tp') answer(p, { write: v === 'yes' });
  };
  var SETTING_CARDS = { multk: 1, basem: 1, expo: 1 };
  function variPrompt(p) {
    var cards = (Array.isArray(p.cards) ? p.cards : []).filter(function (id) { return typeof id === 'string' && Vari.card(id); }).slice(0, 30);
    var n = Vari.unlockedCount(), v = S.vari || {}, fresh = n > (v.seen || 0) ? Vari.unlocked()[n - 1] : null;
    if (fresh) { if (S.vari) S.vari.seen = n; persist(); }
    pendingP = p;
    modal('<h2>Variation card?</h2>' + (fresh ? '<p class="vari-new-line">✨ New card unlocked: <b>' + fresh.icon + ' ' + esc(fresh.name) + '</b>!</p>' : '') +
      '<p class="vari-small">You set the Goal, so you may pick ONE extra rule for this shake. Or play without one.</p>' +
      '<div class="vari-cards">' + cards.map(function (id) { return Vari.cardHTML(Vari.card(id), true, fresh && fresh.id === id).replace(/data-act="variPick"/g, 'data-act="olVari"'); }).join('') +
      '<button class="vari-card none" data-act="olVari" data-arg=""><span class="vc-icon">🙂</span><b>No card</b><span class="vc-rule">Normal rules this shake.</span></button></div>');
  }
  ACT.olVari = function (el) {
    var id = el.dataset.arg || '', p = pendingP;
    if (!p || !O) return;
    if (id && SETTING_CARDS[id]) { Snd.click(); variSetting(id); return; }
    pendingP = null; closeModal();
    if (id && Vari.card(id)) { var c = Vari.card(id); say('pip', 'You picked <b>' + c.icon + ' ' + esc(c.name) + '</b>!'); }
    answer(p, { card: id });
  };
  // Cards with a setting: which k, which base, which colour (the same choices as in a normal match).
  function variSetting(id) {
    var c = Vari.card(id), opts, label;
    if (id === 'multk') { opts = [6, 7, 8, 9, 10, 11].map(function (k) { return { v: 'k' + k, t: String(k) }; }); label = 'Pick k: the Solution must miss the Goal by k, 2k, 3k, …'; }
    else if (id === 'basem') { opts = [{ v: 'b8', t: 'Base 8' }, { v: 'b9', t: 'Base 9' }]; label = 'Count in eights or in nines?'; }
    else {
      opts = Eq.COLORS.filter(function (col) { return G.cubes.some(function (x) { return x.zone === 'resources' && !x.locked && x.color === col && Eq.isDigit(x.s); }); }).map(function (col) { return { v: 'c' + col, t: COLNAME[col], col: col }; });
      label = 'Which colour of number cube can be an exponent?';
    }
    modal('<h2>' + c.icon + ' ' + esc(c.name) + '</h2><p class="vari-small">' + esc(label) + '</p>' +
      '<div class="vari-set">' + opts.map(function (o) { return '<button class="btn' + (o.col ? ' vari-col vc-' + o.col : '') + '" data-act="olVariSet" data-arg="' + id + ':' + o.v + '">' + esc(o.t) + '</button>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn small" data-act="olVariBack">Back to the cards</button></div>');
  }
  ACT.olVariSet = function (el) {
    var parts = String(el.dataset.arg || '').split(':'), id = parts[0], a = parts[1] || '', p = pendingP;
    if (!p || !O || !SETTING_CARDS[id]) return;
    var set = a[0] === 'k' ? { k: +a.slice(1) } : a[0] === 'b' ? { base: +a.slice(1) } : { ecol: a.slice(1) };
    pendingP = null; closeModal(); Snd.click();
    say('pip', 'You picked <b>' + Vari.card(id).icon + ' ' + esc(Vari.cardName(id, set)) + '</b>!');
    answer(p, { card: id, set: set });
  };
  ACT.olVariBack = function () { var p = pendingP; if (p && O) variPrompt(p); };
  function answer(p, body) {
    O.sent[p.id] = 1; O.open = null;
    body.a = 'ans'; body.id = p.id; send(body);
    if (O.state) guestSpeech(O.state);
    renderGame();
  }
  // The shake's results, the same for everybody. Each device only adds its OWN player's progress.
  function showResult(res) {
    O.resultOpen = res.n;
    var pts = {}, sols = {};
    Object.keys(res.pts || {}).forEach(function (k) { var r = rot(+k); if (r !== null) pts[r] = +res.pts[k] || 0; });
    Object.keys(res.sols || {}).forEach(function (k) {
      var s = res.sols[k], r = rot(+k); if (!s || r === null) return;
      sols[r] = { ok: !!s.ok, tokens: s.tokens ? safeTokens(s.tokens) : null, chk: s.chk && Array.isArray(s.chk.reasons) ? { reasons: s.chk.reasons.slice(0, 6).map(function (x) { return String(x).slice(0, 300); }) } : null };
    });
    if (res.n > O.applied) { O.applied = res.n; guestProgress(res, pts); save(); }
    var sample = sampleSolution();
    if (sample) Object.keys(sols).forEach(function (k) { var s = sols[k]; if (sample && s && s.ok && s.tokens && s.tokens.map(function (x) { return typeof x === 'string' ? x : x.s; }).join('') === sample.join('')) sample = null; });
    var anyOk = Object.keys(sols).some(function (k) { return sols[k] && sols[k].ok; });
    var p0 = pts[0] || 0;
    Snd.chime(); playerMood(p0 >= 4 ? 'cheer' : 'clap');
    var vx = window.Vari && Vari.on();
    var html = '<h2 class="hero">Shake over!</h2>' +
      '<div style="text-align:center;font-size:18px">Goal: <b>' + (G.goal ? Eq.fmt(G.goal) : '?') + '</b></div>' +
      (Array.isArray(res.lines) ? res.lines : []).slice(0, 8).map(function (l) { return '<p>' + cleanLine(l) + '</p>'; }).join('') +
      idxs().map(function (i) { return solHTML(i, sols[i]); }).join('') +
      (sample ? '<p><b>' + (anyOk ? 'Another way' : 'One way that works') + ':</b></p>' + (vx ? '<div class="expr vari-expr">' + Vari.exprHTML(sample, null, G.fractions) + '</div>' : exprBox(sample)) +
        '<p style="text-align:center;font-weight:800">= ' + (Eq.rulesOf(G.fractions).multk ? (function () { var e = Eq.evaluate(sample, { fractions: G.fractions }); return e.ok ? Eq.fmt(e.value) + ' <small>(the Goal is ' + Eq.fmt(G.goal) + ': a multiple of ' + Eq.rulesOf(G.fractions).k + ' away)</small>' : Eq.fmt(G.goal); })() : Eq.fmt(G.goal)) +
        (G.sampleWild != null ? ' <small>(every 0 stands for ' + G.sampleWild + ')</small>' : '') + '</p>' :
        (G.goal && !anyOk ? '<div class="okbox">I searched and couldn\'t find any Solution with these cubes.' + (G.sampleComplete === false ? ' <small>(I ran out of searching time, so that does not prove there is none.)</small>' : '') + '</div>' : '')) +
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
      var c = rot(ch.challenger), m = rot(ch.mover), t = ch.tp == null ? null : rot(ch.tp);
      if (c === 0) {
        S.stats.challenges++;
        var won = me === 6;
        if (won) { S.stats.challengeWins++; if (ch.kind === 'now') { S.stats.nowWins++; addXP(25, 'Correct Now! challenge'); } else { S.stats.impWins++; addXP(30, 'Correct Impossible! call'); addStar(); } }
        checkBadges({ type: 'challenge', kind: ch.kind, won: won });
      } else if (m === 0 && me === 6 && ch.kind === 'now') addXP(15, 'Clever move: their Now! failed');
      else if (t === 0 && me >= 4) addXP(15, 'Smart Third Party play');
    }
    S.stats.shakes++; S.stats.pvpShakes++;
    if (G.hintUsed) S.stats.noHint = 0; else S.stats.noHint++;
    var best = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    if (G.players[0].score < best) O.trailed = true;
    checkBadges({ type: 'shake' });
    persist();
    writeSeat(); // new card unlocks reach the host
  }
  function showEnd() {
    O.overShown = G.matchId; save();
    var top = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    var winners = idxs().filter(function (i) { return G.players[i].score === top; }), names = winners.map(function (i) { return esc(G.players[i].name); });
    victoryFX(); Snd.fanfare(); setTimeout(Snd.crowd, 500); Snd.setMood('win'); cue('win');
    banner('⚽ GOOOAL!', winners.length > 1 ? 'It\'s a tie!' : G.players[winners[0]].name + ' wins!');
    if (winners.indexOf(0) >= 0 && winners.length === 1) { playerCelebrate(); mateMood('clap'); checkBadges({ type: 'match', won: true, trailed: O.trailed, perfect: G.players[0].list.every(function (v) { return v >= 4; }) }); }
    else { playerMood('clap'); if (mateSeat() !== null && winners.indexOf(mateSeat()) >= 0) mateMood('cheer'); }
    persist();
    var order = idxs().sort(function (x, y) { return G.players[y].score - G.players[x].score; });
    var html = '<h2 class="hero">' + (winners.length > 1 ? 'Tie: ' + names.join(' & ') + '!' : names[0] + ' wins!') + '</h2>' +
      order.map(function (i) { return '<div class="score-line' + (G.players[i].score === top ? ' win' : '') + '"><span>' + (G.players[i].score === top ? ico('trophy') + ' ' : '') + esc(G.players[i].name) + '</span><span class="p">' + G.players[i].score + '</span></div>'; }).join('') +
      (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '');
    if (window.Social && Social.matchCard) { try { html += Social.matchCard({}); } catch (e) {} }
    html += '<div class="row" style="margin-top:12px"><button class="btn green" data-act="olRematch">' + ico('play') + ' Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Leave</button></div>';
    setTimeout(function () { if (O && G && O.overShown === G.matchId) modal(html, null); }, 600);
  }
  // Back on a finished match after a reload: the choice again, without the fanfare.
  function endChoice() {
    modal('<h2 class="hero">The match is over</h2>' + idxs().slice().sort(function (x, y) { return G.players[y].score - G.players[x].score; }).map(function (i) { return '<div class="score-line"><span>' + esc(G.players[i].name) + '</span><span class="p">' + G.players[i].score + '</span></div>'; }).join('') +
      '<div class="row" style="margin-top:12px"><button class="btn green" data-act="olRematch">' + ico('play') + ' Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Leave</button></div>');
  }
  // "Play again": this player is ready; the host starts the next match when everybody is.
  ACT.olRematch = function () {
    closeModal();
    drainQueue(function () { if (!O || O.role !== 'guest') return; O.trailed = false; O.rdy = O.spect ? (O.rd | 0) + 1 : (O.rd | 0); save(); writeSeat(); rematchWait(); });
  };
  function rematchWait() {
    if (!O || O.role !== 'guest') return;
    O.rmWait = true;
    var target = O.spect ? (O.rd | 0) + 1 : (O.rd | 0);
    modal('<h2 class="hero">' + ico('play') + ' Play again!</h2>' + roomList(target) + '<p class="ol-wait">Waiting for <b>' + hostName() + '</b> to start the next match…</p>' +
      '<div class="row"><button class="btn" data-act="toMenu">' + ico('home') + ' Leave</button></div>');
  }
  // This device's player isn't in the match that just started (they weren't ready): watch the menu, play next time.
  function spectator(st, h) {
    var mid = String(h.matchId);
    if (O.spect === mid) return;
    O.spect = mid; O.rmWait = false;
    modal('<h2 class="hero">A match has started</h2><p style="text-align:center"><b>' + hostName() + '</b> started a match before you were ready. You can play in the next one!</p>' +
      '<div class="row"><button class="btn green" data-act="olRematch">I\'ll play next time</button><button class="btn" data-act="toMenu">' + ico('home') + ' Leave</button></div>');
  }
  function ended() {
    if (!O) return;
    var o = O, g = G, hn = (g && g.mode === 'online' && g.players[rot(0)]) ? g.players[rot(0)].name : (o.seats[0] ? o.seats[0].name : 'The host');
    stopSubs(o); O = null; forget(); hideBanner(); hideOffline();
    if (B) { $('#builder').classList.remove('on'); B = null; }
    if (g && g.mode === 'online') {
      modal('<h2 class="hero">The game has ended</h2><p style="text-align:center"><b>' + esc(hn) + '</b> ended the online game. Everything you earned is saved.</p>' +
        '<div class="row"><button class="btn green" data-act="toMenu">' + ico('home') + ' Menu</button></div>');
    } else {
      modal('<h2>The game has ended</h2><p style="text-align:center">The host closed the game.</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
    }
  }

  // ================================================================ EVERYBODY: presence, banners, emotes, leaving
  var missSince = {}, bannerKey = '', bannerQuiet = false, bannerTimer = null;
  function onPresence(map) {
    if (!O) return;
    var before = O.here || {}; O.here = map || {};
    var now = Date.now();
    [0, 1, 2].forEach(function (s) {
      if (O.here[s]) { if (missSince[s] && !before[s] && isHost()) cameBack(s); delete missSince[s]; }
      else if (!missSince[s]) { missSince[s] = now; if (isHost() && O.back[s]) delete O.back[s]; }
    });
    if (isHost() && O.inLobby && JSON.stringify(before) !== JSON.stringify(O.here)) lobbyHost();
    clearTimeout(bannerTimer); bannerTimer = setTimeout(function () { refreshBanner(); }, 3100);
    refreshBanner();
  }
  function cameBack(s) {
    var pi = seatOfSlot(s);
    if (!on() || O.over || pi <= 0) return;
    if (O.sub[s]) { if (!O.back[s]) { O.back[s] = true; toast('<b>' + nm(pi) + '</b> is back! They play again from the next shake.'); } }
    else if (O.left[s] || (Date.now() - (missSince[s] || 0) > 3000)) toast('<b>' + nm(pi) + '</b> is back!');
    delete O.left[s]; save();
  }
  // Players in this match who are away right now (3 calm seconds, or they tapped Leave). Creatures never are.
  function missing() {
    if (!on() || O.over) return [];
    var now = Date.now();
    return idxs().filter(function (i) {
      if (i === 0 || isAI(i)) return false;
      var s = G.players[i].slot;
      if (isHost() && O.left[s]) return true;
      return !(O.here || {})[s] && missSince[s] && now - missSince[s] >= 3000;
    });
  }
  function refreshBanner(force) {
    if (!O) return;
    var miss = missing(), key = miss.join(',');
    if (!miss.length) { if (bannerKey) { hideBanner(); } return; }
    if (key !== bannerKey || force) { bannerQuiet = false; bannerKey = key; }
    showBanner(miss);
  }
  function showBanner(miss) {
    var el = $('#olBanner');
    if (!el) { el = document.createElement('div'); el.id = 'olBanner'; el.className = 'ol-banner'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    var hostI = isGuest() ? rot(0) : 0;
    var lines = miss.map(function (i) { return '<span><b>' + nm(i) + '</b> ' + (isHost() && O.left[G.players[i].slot] ? 'left the game: they can come back with the same code.' : 'lost connection: waiting…') + '</span>'; }).join('');
    var btns = '';
    if (!bannerQuiet) {
      if (isHost()) {
        var k = creatureFor();
        btns = (k >= 0 ? miss.map(function (i) { return '<button class="btn small green" data-act="olSub" data-arg="' + i + '">' + esc(OPPONENTS[k].emoji + ' ' + OPPONENTS[k].name) + ' plays for ' + nm(i) + '</button>'; }).join('') : '') +
          '<button class="btn small" data-act="olKeepWaiting">Keep waiting</button><button class="btn small" data-act="olEndMatch">End the match</button>';
      } else if (miss.indexOf(hostI) >= 0) btns = '<button class="btn small" data-act="olKeepWaiting">Keep waiting</button><button class="btn small" data-act="olEndMatch">Leave the game</button>';
    }
    el.innerHTML = lines + (btns ? '<span class="ol-bb">' + btns + '</span>' : '');
  }
  function hideBanner() { bannerKey = ''; bannerQuiet = false; var el = $('#olBanner'); if (el) el.remove(); }
  ACT.olKeepWaiting = function () { bannerQuiet = true; refreshBanner(); };
  ACT.olEndMatch = function () {
    modal('<h2>' + (isHost() ? 'End the match?' : 'Leave the game?') + '</h2><p style="text-align:center">Nobody loses anything: all the XP and badges you earned are saved. You can start a new online game later.</p>' +
      '<div class="row"><button class="btn" data-act="closeModal">Keep waiting</button><button class="btn pink" data-act="toMenu">' + (isHost() ? 'End the match' : 'Leave') + '</button></div>');
  };
  // This device's own connection: a calm line at the top while it is away.
  var offTimer = null;
  function watchConnection() {
    if (!Net.connection) return;
    O.subs.push(Net.connection(function (ok) {
      clearTimeout(offTimer);
      if (ok) { hideOffline(); return; }
      offTimer = setTimeout(function () { if (O) showOffline(); }, 1500);
    }));
  }
  function showOffline() {
    var el = $('#olOffline');
    if (!el) { el = document.createElement('div'); el.id = 'olOffline'; el.className = 'ol-offline'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = '📶 You\'re offline: reconnecting… <small>Your moves are kept and sent when the Wi-Fi is back.</small>';
  }
  function hideOffline() { clearTimeout(offTimer); var el = $('#olOffline'); if (el) el.remove(); }
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
  function stopSubs(o) { if (window.VoiceChat) VoiceChat.leaveRoom(); /* VOICE: hang up first (before the seat is freed) */ (o.subs || []).forEach(function (f) { try { f(); } catch (e) {} }); o.subs = []; clearTimeout(bannerTimer); missSince = {}; }
  // VOICE (docs/handoff/voice.md): talking inside the game. js/voice.js does the work; these two helpers give it
  // the room (code, own seat, names, a way to redraw the lobby) and put its block into the lobby pop-ups.
  function voiceRoom() {
    if (!window.VoiceChat || !O) return;
    VoiceChat.room(O.code, O.slot, function (s) { if (!O) return ''; if (s === O.slot) return cleanName(S.name); var i = O.seats[s]; return i ? i.name : (s === 0 ? 'The host' : 'Player'); },
      function () { if (!O || !O.inLobby) return; if (O.role === 'host') lobbyHost(); else guestLobby(); });
  }
  function voiceLobby() { return window.VoiceChat ? VoiceChat.lobbyHTML() : ''; }
  // Load js/voice.js + css/voice.css if index.html doesn't list them yet.
  (function () {
    var go = function () {
      if (!document.querySelector('link[href*="voice.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/voice.css'; document.head.appendChild(l); }
      if (window.VoiceChat || document.querySelector('script[src*="js/voice.js"]')) return;
      var s = document.createElement('script'); s.src = 'js/voice.js'; s.onload = function () { if (O) voiceRoom(); }; document.head.appendChild(s);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  })();
  // /VOICE
  // Leave on purpose: the host closes the room; a guest says goodbye (their seat stays theirs during a match, so the
  // same code brings them back; after a match or in the lobby it is freed).
  function leave() {
    if (!O) return;
    var o = O, matchOn = !!(G && G.mode === 'online' && !(o.state && o.state.o) && o.role === 'guest' && G.slots && G.slots.indexOf(o.slot) >= 0);
    O = null; stopSubs(o); forget(); hideBanner(); hideOffline();
    if (o.role === 'host') { Net.write('rooms/' + o.code, null); try { localStorage.removeItem(LASTKEY); } catch (e) {} }
    else {
      o.n++; Net.write('rooms/' + o.code + '/acts/' + o.slot + '/' + o.n, JSON.stringify({ a: 'leave', sid: o.sid }));
      if (!matchOn) { Net.write('rooms/' + o.code + '/seats/' + o.slot, null); Net.write('rooms/' + o.code + '/guests/' + o.slot, null); }
    }
  }
  ACT.olCancel = function () { leave(); closeModal(); };
  function problem(e) {
    if (window.console) console.error('[online]', e);
    modal('<h2>Couldn\'t connect</h2><p style="text-align:center">The game couldn\'t reach the online service. Check the Wi-Fi and try again.</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
  }

  // ================================================================ THE PEOPLE AT THE TABLE (3D)
  // This device's player stands at the near side. A creature (the third seat, or one playing for someone who left)
  // stands across the table. The other human: across the table ('far'), or beside the left end when a creature is
  // across. The 3D table has room for one other person (T3.mate), so with three humans the next player is shown.
  function mateSeat() {
    if (!G) return null;
    var hs = idxs().filter(function (i) { return i !== 0 && !isAI(i); });
    return hs.length ? hs[0] : null;
  }
  function avatars(creaturesDone) {
    if (!G || G.mode !== 'online' || !O) return;
    var others = idxs().filter(function (i) { return i !== 0; }), ais = others.filter(isAI), hs = others.filter(function (i) { return !isAI(i); });
    var creSig = ais.map(function (i) { return i + ':' + G.players[i].aiIdx; }).join(',');
    var sig = creSig + '|' + hs.map(function (i) { var p = G.players[i]; return i + JSON.stringify(p.look) + p.jersey + p.name; }).join(',') + '|' + (S.set.me || '');
    if (O.avSig === sig) return;
    var oldCre = O.avCre;
    O.avSig = sig; O.avCre = creSig;
    var grown = grownUp();
    if (T3.playerSet) T3.playerSet({ who: grown ? 'tata' : 'kid', name: grown ? S.name : (typeof backName === 'function' ? backName() : S.name), number: S.jersey || '7' });
    if (!creaturesDone && creSig !== oldCre) {
      var list = ais.map(function (i) { return G.players[i].ai; });
      if (list.length > 1 && T3.setCreatures) T3.setCreatures(list.map(function (o) { return { kind: o.kind, pack: o.pack || 'classic' }; }));
      else setCreature(list[0] ? list[0].kind : null, list[0] && list[0].pack);
      if (list.length && typeof creaturesEnter === 'function') creaturesEnter();
    }
    if (hs.length) {
      var p = G.players[hs[0]], L = p.look || {};
      var spec = { who: L.who === 'tata' ? 'tata' : 'kid', seat: ais.length ? 'left' : 'far', name: L.back || p.name, number: p.jersey || '7' };
      if (L.kit) spec.kit = L.kit;
      mateShow(spec);
    } else mateShow(null);
  }
  // For js/game.js avatarMoveFn (optional hook, see docs/handoff/online.md): on the host, who carries a human's cube.
  function moveFn(who) {
    if (!on() || !isHost() || !T3.active()) return null;
    if (who === 0) return T3.playerMove || null;
    return (mateSeat() === who && T3.mateMove) ? T3.mateMove : null;
  }

  // ================================================================ MENU
  function setupCardHTML() {
    return '<div class="opp mode" data-act="online"><span class="avatar lg" style="background:#d0ebff;color:#1864ab;font-size:46px">' + ico('people') + '</span><h3>Online</h3><div class="otitle">Play on two or three devices, far apart (talk on FaceTime)</div></div>';
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
    if (O) { if (O.role === 'host') lobbyHost(); else guestLobby(); return; }
    modal('<h2 class="hero">' + ico('people') + ' Play online</h2>' +
      '<p style="text-align:center">Two or three players, each on their own device, far apart. Talk on FaceTime while you play!</p>' +
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
          HOST_KEEP.forEach(function (k) { if (s[k] !== undefined && s[k] !== null) O[k] = s[k]; });
          ['answers', 'ready', 'sub', 'back', 'left', 'joinedAt'].forEach(function (k) { if (!O[k] || typeof O[k] !== 'object') O[k] = {}; });
          hostSubs();
          if (s.g) resumeHost(s); else { closeModal(); gotoTitle(); lobbyHost(); }
        } else {
          var slot = s.slot || 1;
          return Net.read('rooms/' + s.code + '/guests/' + slot).then(function (gu) {
            if (gu !== uid) throw { gone: true };
            O = newGuest(s.code, uid, slot);
            GUEST_KEEP.forEach(function (k) { if (s[k] !== undefined && s[k] !== null) O[k] = s[k]; });
            O.vsFor = 'resumed';
            closeModal(); gotoTitle();
            guestSubs(); guestLobby();
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
    G.players.forEach(function (p) { p.ai = (p.aiIdx === (p.aiIdx | 0) && OPPONENTS[p.aiIdx]) ? OPPONENTS[p.aiIdx] : null; });
    G.busy = false; G.carrying = false; G.selected = null; G.speech = null;
    if (G.vari === 'expo' && window.Vari) { var fr = G.fractions; Vari.apply('expo', G.variSet); G.fractions = fr; } // the live exponent counts again
    xpLog = []; O.avSig = null; O.prompts = {}; O.waiting = {};
    go('game'); Snd.setMood('play'); playerShow(); avatars();
    if (Snd.ambience) Snd.ambience(['stadium', 'night', 'beach', 'volcano'].indexOf(S.cos.mat) >= 0 ? 'stadium' : 'room');
    if (window.Vari) Vari.chip(); if (window.Bonus && Bonus.chip) Bonus.chip();
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
      writeSolution(writer, ch.kind, function (ok, tokens, chk) {
        if (G.ch.tp === null || G.ch.tp === undefined) resolveChallenge(ok, tokens, chk, null);
        else askThirdParty(G.ch.tp, ch.kind, function (tpRes) { resolveChallenge(ok, tokens, chk, tpRes); });
      });
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
      if (isGuest() && (O.pouring || O.open || O.ng || O.carry)) return '';
      if (G.phase === 'goal') {
        if (G.setter !== 0 || G.busy) return '';
        if (isHost() ? O.noGoal : !O.gw) return '';
        return orig();
      }
      if (G.phase !== 'move') return '';
      var out = '';
      if (humanTurn() && G.turn === 0) {
        var nc = nowCheck();
        out += '<button class="btn now" data-act="callNow" data-arg="0"' + (nc ? ' title="' + esc(nc) + '"' : '') + '>' + ico('bolt') + ' Now!</button>' +
          '<button class="btn imp" data-act="callImp" data-arg="0">' + ico('ban') + ' Impossible!</button><button class="btn" data-act="hint">' + ico('bulb') + ' Hint</button>';
      } else if (nP() > 2 && G.lastMover !== null && G.lastMover !== 0 && G.turn !== 0 && !G.carrying && !isAI(0)) {
        // Three players: you may challenge the move that was just made even when it isn't your turn.
        out += '<div class="also"><span>You can challenge too:</span><button class="btn small now" data-act="callNow" data-arg="0">' + ico('bolt') + ' Now!</button><button class="btn small imp" data-act="callImp" data-arg="0">' + ico('ban') + ' Impossible!</button></div>';
      }
      if (window.Social && Social.emoteBar && T3.active()) out += Social.emoteBar();
      return out;
    };
  });
  // The match's operations: chosen in the lobby (this device's, or another player's unlocks).
  wrapG('stageInfo', function (orig) { return function () { return (on() && isHost() && O.stage) ? O.stage : orig(); }; });
  wrapG('newShake', function (orig) {
    return function (fixed) {
      if (on() && isHost()) { G.rollNo = (G.rollNo || 0) + 1; O.prompts = {}; O.noGoal = false; O.goalWait = null; returnSubs(); }
      return orig(fixed);
    };
  });
  wrapG('startGoalPhase', function (orig) {
    return function () {
      if (!on() || !isHost()) return orig();
      if (window.Bonus && Bonus.beforeGoal(startGoalPhase)) return; // a new die is celebrated, the Twist is read (host device)
      if (G.setter === 0 || isAI(G.setter)) return orig();
      var setter = G.setter;
      // Variation card: a guest picks from the cards unlocked (and switched on) on THEIR device.
      if (window.Vari && !G.variDone) {
        G.variDone = true;
        var info = O.seats[G.players[setter].slot], cards = (info ? info.vc : []).filter(function (id) { return Vari.card(id) && Vari.hasEffect(id); });
        if (cards.length) {
          say('pip', wait(setter, 'pick a variation card')); renderGame();
          ask(setter, { k: 'vari', cards: cards }, function (ans) {
            var pk = variAnswer(ans, cards);
            if (pk) { Vari.apply(pk.id, pk.set); var c = Vari.card(pk.id); say('pip', '<b>' + nm(setter) + '</b> picked a card: <b>' + c.icon + ' ' + esc(Vari.cardName(pk.id)) + '</b>!'); if (Snd.pop) Snd.pop(); }
            startGoalPhase();
          }, function () { startGoalPhase(); });
          return;
        }
      }
      O.goalWait = setter;
      say('pip', wait(setter, 'set the Goal')); renderGame();
    };
  });
  // A guest's card pick, checked: a card that was offered, with a setting from the allowed list.
  function variAnswer(ans, cards) {
    if (!ans || typeof ans.card !== 'string' || cards.indexOf(ans.card) < 0) return null;
    var id = ans.card, s = ans.set && typeof ans.set === 'object' ? ans.set : {};
    if (id === 'multk') return (s.k === (s.k | 0) && s.k >= 6 && s.k <= 11) ? { id: id, set: { k: s.k } } : null;
    if (id === 'basem') return (s.base === 8 || s.base === 9) ? { id: id, set: { base: s.base } } : null;
    if (id === 'expo') return (Eq.COLORS.indexOf(s.ecol) >= 0 && G.cubes.some(function (c) { return c.zone === 'resources' && !c.locked && c.color === s.ecol && Eq.isDigit(c.s); })) ? { id: id, set: { ecol: s.ecol } } : null;
    return { id: id, set: null };
  }
  wrapG('nextTurn', function (orig) {
    return function () {
      if (!on() || !isHost() || G.phase !== 'move' || G.turn === 0 || isAI(G.turn)) return orig();
      if (aiInterject()) return; // three at the table: a creature may challenge the move that was just made
      say('pip', wait(G.turn, 'move') + (nP() > 2 && G.lastMover !== null && G.lastMover !== 0 ? ' You can challenge too!' : '')); renderGame();
    };
  });
  wrapG('openGoalBuilder', function (orig) {
    return function (pi, onDone, noCancel) {
      if (!on() || !isHost() || pi === 0 || isAI(pi)) return orig.apply(this, arguments);
      say('pip', wait(pi, 'build a Goal and a Solution')); renderGame();
      var tries = 0, setter = G.setter;
      (function again() {
        ask(pi, { k: 'goal', noCancel: !!noCancel, t: tries }, function (ans) {
          var toks = cubeTokens(ans && ans.tokens, 'goal'), g = toks && Eq.checkGoal(toks, G.fractions);
          if (g && g.ok) onDone(toks, g.value); else { tries++; again(); }
        }, function () { endShake({ pts: noGoalScore(pi, setter, false), lines: [esc(G.players[pi].name) + ' couldn\'t finish, so the “No Goal” call stands.'], sols: {} }); });
      })();
    };
  });
  wrapG('openSolutionBuilder', function (orig) {
    return function (pi, mode, cb) {
      if (!on() || !isHost() || pi === 0 || isAI(pi)) return orig.apply(this, arguments);
      say('pip', wait(pi, 'write a Solution')); renderGame();
      ask(pi, { k: 'sol', mode: mode }, function (ans) {
        var toks = ans && ans.tokens ? cubeTokens(ans.tokens, 'sol') : null;
        var chk = toks ? Eq.checkSolution(toks, solCtx(mode)) : null;
        cb(!!(chk && chk.ok), toks, chk || { reasons: [ans && ans.tokens ? 'That Solution could not be read.' : 'No Solution was written.'] });
      }, function () { aiWrite(pi, mode, cb); });
    };
  });
  // Three players: the Third Party (on another device) decides in private whether to write a Solution too.
  wrapG('askThirdParty', function (orig) {
    return function (tp, kind, cb) {
      if (!on() || !isHost() || tp === 0 || isAI(tp)) return orig(tp, kind, cb);
      say('pip', wait(tp, 'decide whether to write a Solution too')); renderGame();
      ask(tp, { k: 'tp', kind: kind }, function (ans) {
        if (ans && ans.write) writeSolution(tp, kind, function (ok, tokens, chk) { cb({ presented: true, ok: ok, tokens: tokens, chk: chk }); });
        else cb({ presented: false });
      }, function () { askThirdParty(tp, kind, cb); });
    };
  });
  // "No Goal": every other person decides on their own device; the first "Challenge!" wins, all "I agree" = roll again.
  wrapG('askNoGoal', function (orig) {
    return function (setter) {
      if (!on() || !isHost()) return orig(setter);
      O.noGoal = true;
      var hs = idxs().filter(function (i) { return i !== setter && !isAI(i); });
      if (!hs.length) { O.noGoal = false; return orig(setter); }
      var done = false, agreed = {};
      var decide = function (i, ch) {
        if (done || !on() || G.phase !== 'goal') return;
        if (ch) {
          done = true; hs.forEach(function (j) { if (j !== i && j !== 0) withdraw(j); });
          if (i !== 0 && O.localNG) { O.localNG = false; closeModal(); }
          humanChallengesNoGoal(i, setter); return;
        }
        agreed[i] = 1;
        if (hs.every(function (j) { return agreed[j]; })) { done = true; O.noGoal = false; ACT.noGoalAgree(); }
        else { var left = hs.filter(function (j) { return !agreed[j]; }); say('pip', wait(left[0], 'answer the “No Goal” call')); renderGame(); }
      };
      O.ngDecide = decide;
      hs.forEach(function (h) {
        if (h === 0) {
          O.localNG = true;
          modal('<h2>🤷 No Goal?</h2><p style="text-align:center"><b>' + nm(setter) + '</b> says no Goal can be made with these cubes. Do you agree?</p>' +
            '<div class="row"><button class="btn green" data-act="olNG" data-arg="agree">I agree</button><button class="btn now" data-act="olNG" data-arg="challenge">Challenge! I can make one</button></div>');
        } else ask(h, { k: 'nogoal', setter: setter }, function (ans) { decide(h, !!(ans && ans.challenge)); }, function () { decide(h, false); });
      });
      var others = hs.filter(function (j) { return j !== 0; });
      if (others.length) say('pip', wait(others[0], 'answer the “No Goal” call'));
      renderGame();
    };
  });
  ACT.olNG = function (el) { closeModal(); if (!O) return; O.localNG = false; var d = O.ngDecide; if (d) d(0, el.dataset.arg === 'challenge'); };
  // The last cube: every other person decides on their own device (creatures first, as in a normal match);
  // the first Impossible! wins, all "Let's write!" = everybody writes at the same time.
  wrapG('lastCubePlayed', function (orig) {
    return function () {
      if (!on() || !isHost()) return orig();
      var mover = G.lastMover, others = idxs().filter(function (i) { return i !== mover; });
      G.phase = 'lastcheck';
      var ais = others.filter(isAI), hs = others.filter(function (i) { return !isAI(i); });
      function askHumans() {
        if (!hs.length) { startLastWrite(); return; }
        var done = false, said = {};
        var decide = function (i, imp) {
          if (done || !on() || G.phase !== 'lastcheck') return;
          if (imp) {
            done = true; hs.forEach(function (j) { if (j !== i && j !== 0) withdraw(j); });
            if (i !== 0 && O.localLast) { O.localLast = false; closeModal(); }
            G.lastMover = mover; challenge('impossible', i); return;
          }
          said[i] = 1;
          if (hs.every(function (j) { return said[j]; })) { done = true; startLastWrite(); }
          else { var left = hs.filter(function (j) { return !said[j]; }); say('pip', 'The last cube is on the mat! ' + wait(left[0], 'decide')); renderGame(); }
        };
        O.lastDecide = decide;
        say('pip', 'The last cube is on the mat!', 'think');
        hs.forEach(function (h) {
          if (h === 0) {
            O.localLast = true;
            modal('<h2 class="hero">Last cube played!</h2><p style="text-align:center">If you think NOBODY can make the Goal now, call Impossible! Otherwise everybody writes a Solution (4 points if correct, 2 if not).</p>' +
              '<div class="row"><button class="btn imp" data-act="olLast" data-arg="imp">' + ico('ban') + ' Impossible!</button><button class="btn green" data-act="olLast" data-arg="write">' + ico('pencil') + ' Let\'s write!</button></div>');
          } else ask(h, { k: 'last' }, function (ans) { decide(h, !!(ans && ans.imp)); }, function () { decide(h, false); });
        });
        renderGame();
      }
      if (ais.length) {
        var p = ais[0], o = G.players[p].ai, st = snapshot(), sit = aiSituation();
        say('opp', pick(o.think)); renderGame();
        aiThink('callsLastImpossible', [AI.skill(o), st, G.goal, G.fractions], 1200).then(function (imp) {
          if (!aiStill(sit)) return;
          if (imp) { G.lastMover = mover; challenge('impossible', p); } else askHumans();
        }).catch(aiOops);
      } else askHumans();
    };
  });
  ACT.olLast = function (el) { closeModal(); if (!O) return; O.localLast = false; var d = O.lastDecide; if (d) d(0, el.dataset.arg === 'imp'); };
  // Everybody writes at the same time: the other devices are asked right away, not after this one finishes.
  wrapG('startLastWrite', function (orig) { return function () { if (on() && isHost()) remoteSeats().forEach(function (i) { ask(i, { k: 'sol', mode: 'last' }, null); }); return orig(); }; });
  wrapG('resolveChallenge', function (orig) { return function () { if (on() && isHost()) O.resultCh = JSON.parse(JSON.stringify(G.ch)); return orig.apply(this, arguments); }; });
  wrapG('endShake', function (orig) {
    return function (r) {
      var res = orig(r); // (Bonus.adjust has run inside: the published points include a Golden Goal / Bonus +2)
      if (on() && isHost()) {
        O.resultN++; O.noGoal = false; O.goalWait = null;
        O.result = { n: O.resultN, mid: G.matchId, pts: r.pts, lines: r.lines, sols: r.sols || {}, ch: O.resultCh || null };
        O.resultCh = null; schedulePublish(true);
      }
      return res;
    };
  });
  // The next shake starts when EVERYBODY has read the results.
  wrapG('nextShake', function (orig) {
    return function () {
      if (!on() || !isHost() || !O.result || O.over) return orig();
      O.hostReady = O.result.n;
      var waiting = remoteSeats().filter(function (s) { return (O.ready[s] || 0) < O.result.n; });
      if (waiting.length) { say('pip', wait(waiting[0], 'finish reading the results')); renderGame(); save(); return; }
      return orig();
    };
  });
  wrapG('endMatch', function (orig) {
    return function () {
      if (on() && isHost() && !O.over) { O.over = true; O.round++; O.goalWait = null; Net.write(base() + '/locked', false); schedulePublish(true); save(); }
      return orig();
    };
  });
  wrapG('seatPeople', function (orig) { return function (mode, cfg) { if (mode === 'online' && O) { O.avSig = null; O.avCre = (function () { return idxs().filter(function (i) { return i !== 0 && isAI(i); }).map(function (i) { return i + ':' + G.players[i].aiIdx; }).join(','); })(); avatars(true); return; } return orig(mode, cfg); }; });

  // The guest's taps become messages to the host.
  wrapG('doMove', function (orig) {
    return function (id, zone, dragged) {
      if (!on() || !isGuest()) return orig(id, zone, dragged);
      var c = G.cubes[id];
      if (!humanTurn() || !c || c.zone !== 'resources' || c.locked || ['required', 'permitted', 'forbidden'].indexOf(zone) < 0) return;
      if (zone === 'forbidden' && zoneCubes('resources').length === 1) { say('pip', 'The very last cube can\'t go to Forbidden. Put it in <b>Required</b> or <b>Permitted</b>!', 'think'); Snd.boop(); return; }
      G.selected = null;
      send({ a: 'move', id: id, zone: zone });
      say('pip', pick(['Nice move!', 'Good thinking!', 'Thunk! Placed.', 'Ooh, interesting!']), 'happy');
      var land = function () { c.zone = zone; c.order = 1e9 + O.n; G.justMoved = id; G.busy = true; G.carrying = false; }; // shown at once; the host's state confirms it
      if (!dragged && T3.active() && T3.playerMove) {
        O.animated = G.matchId + '.' + G.rollNo + '.' + id; O.carry = true; G.busy = true; G.carrying = true; renderGame();
        var fin = false;
        T3.playerMove(id, zone, function () {
          if (fin || !O) return; fin = true; O.carry = false;
          var st = O.state, sc = st && st.g && st.g.cubes && st.g.cubes[id];
          if (sc && sc.zone !== 'resources') apply(st); else { land(); renderGame(); }
        });
        return;
      }
      land(); if (!T3.active()) Snd.thunk();
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
      if (!O.gw) return;
      openGoalBuilder(0, function (tokens) { G.busy = true; send({ a: 'goal', tokens: tokens }); renderGame(); });
    };
  });
  wrapA('noGoal', function (orig) {
    return function () {
      if (!on()) return orig();
      if (isGuest()) { if (G.phase === 'goal' && G.setter === 0 && !G.busy && O.gw) { G.busy = true; O.ng = true; send({ a: 'nogoal' }); guestSpeech(O.state || {}); renderGame(); } return; }
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
  // Leaving on purpose (Menu → Leave, the end-of-match Leave / Menu button, "End the match").
  wrapA('reallyQuit', function (orig) { return function () { if (on() || O) leave(); return orig(); }; });
  wrapA('toMenu', function (orig) { return function () { if (on() || O) leave(); return orig(); }; });
  // "Play again" after a match: the host goes back to the lobby (everybody taps ready there); a guest says it's ready.
  wrapA('rematch', function (orig) {
    return function () {
      if (on() && isGuest()) return ACT.olRematch();
      if (on() && isHost()) { closeModal(); drainQueue(function () { if (O) lobbyHost(); }); return; }
      return orig();
    };
  });
  // Coming back after a reload: the splash button goes straight back to the game.
  wrapA('start', function (orig) {
    return function () { var s = saved(); if (!s || !Net.available()) return orig(); Snd.init(); resume(s); };
  });
  if (saved() && Net.available()) { var tb = document.querySelector('#splash .tapgo'); if (tb) tb.lastChild.textContent = ' Back to my online game'; }

  // BONUS dice online: the host's earned dice (and its Parent-corner switches) join the roll when the lobby's
  // "Bonus dice" switch is on. js/bonus.js only rolls them in 'ai' / 'pvp' matches, so for the host's own calls the
  // match briefly counts as 'pvp' (or as a mode without dice when the switch is off). Only Bonus's public API is used.
  if (window.Bonus && Bonus.onShake && Bonus.beforeGoal) {
    var bonusOnShake = Bonus.onShake, bonusBefore = Bonus.beforeGoal;
    var asMode = function (g, fn) {
      var want = !!(O && O.bonus), has = !!(Bonus.activeFor && Bonus.activeFor(g));
      if (want === has) return fn();
      var m = g.mode; g.mode = want ? 'pvp' : 'p3';
      try { return fn(); } finally { g.mode = m; }
    };
    var hostMatch = function (g) { return !!(g && g.mode === 'online' && O && O.role === 'host'); };
    Bonus.onShake = function (g, fixed) { return hostMatch(g) ? asMode(g, function () { return bonusOnShake(g, fixed); }) : bonusOnShake(g, fixed); };
    Bonus.beforeGoal = function (again) {
      if (!hostMatch(G)) return bonusBefore(again);
      var r = asMode(G, function () { return bonusBefore(again); });
      if (current === 'game') renderGame(); // (re-drawn as an online match)
      return r;
    };
  }

  // For testing in the browser console (tabs or iframes with ?onlinetest=1&p=a / &p=b / &p=c).
  window.TataOnline = { O: function () { return O; }, drop: function (v) { return Net.drop(v); }, saved: saved, state: function () { return O && O.state; },
    sub: function (pi) { substitute(pi); }, publish: function () { schedulePublish(true); } };

  return { setup: setup, setupCardHTML: setupCardHTML, on: on, isHost: isHost, isGuest: isGuest, leave: leave, moveFn: moveFn };
})();
