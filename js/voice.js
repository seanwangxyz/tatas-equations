'use strict';
// ======================= TALK WHILE YOU PLAY (voice / video inside online games) =======================
// Full write-up: docs/handoff/voice.md. In short:
//   - Peer-to-peer WebRTC between the people in one online room (a mesh: up to 3 devices, so at most 2 links each).
//     Sound and pictures go straight from device to device. NOTHING but the small "how to connect" notes (offers,
//     answers, network candidates) goes through Firebase, under rooms/<CODE>/rtc/<my seat>/…, and only the sender
//     writes its own notes. The notes are removed when someone hangs up / leaves / closes the page.
//   - Public STUN only (Google's stun.l.google.com:19302 and stun1, Cloudflare's stun.cloudflare.com:3478). There is
//     no TURN relay, so some networks (strict company / school / mobile networks) can't connect: after 10 s the
//     player gets a kind line and the game goes on.
//   - OFF on every device until a grown-up allows it once (press and hold), remembered on that device only.
//   - The browser's microphone / camera question appears only after a tap on "🎙 Talk" / "📷 See each other".
//
// Two parts:
//   VoiceCore (pure, between the CORE markers): message parsing, the mailbox that turns the rtc subtree into events,
//     "perfect negotiation" for one link (glare-safe), and the Session that runs all links of one device.
//     tests/voice.test.js runs it under node with pretend peer connections.
//   VoiceChat (page): media (microphone, camera, or fake media in ?onlinetest=1), the lobby block, the floating
//     control, the video bubbles, the talking rings, stats, failure detection, wake lock, device changes.
//
// Signalling layout (all values are short JSON strings):
//   rooms/<CODE>/rtc/<seat>/hi         {s: session id, cam: bool, mic: bool}     "I'm in the call" (this page load)
//   rooms/<CODE>/rtc/<seat>/<to>/<n>   {t:'desc'|'cand', s: my session, r: their session, d | c}
// A message is used only if s is the sender's current session and r is mine, so notes from before a reload never
// confuse a new connection, in any order.

/*CORE-START*/
var VoiceCore = (function () {
  var MAX_SDP = 15000, MAX_CAND = 1000, MAX_CANDS_PER_LINK = 60, SEATS = ['0', '1', '2'];
  var SID_RE = /^[a-z0-9]{4,16}$/;
  function newSid() { var s = ''; while (s.length < 10) s += Math.random().toString(36).slice(2); return s.slice(0, 10); }
  // The lower seat starts each link (host first); the higher seat is "polite" (gives way when both offer at once).
  function polite(me, other) { return +me > +other; }
  function starts(me, other) { return +me < +other; }

  function parseHi(v) {
    if (typeof v !== 'string' || v.length > 200) return null;
    var o; try { o = JSON.parse(v); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || typeof o.s !== 'string' || !SID_RE.test(o.s)) return null;
    return { s: o.s, cam: o.cam === true, mic: o.mic !== false };
  }
  function parseMsg(v) {
    if (typeof v !== 'string' || v.length > MAX_SDP + 400) return null;
    var o; try { o = JSON.parse(v); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || typeof o.s !== 'string' || typeof o.r !== 'string' || !SID_RE.test(o.s) || !SID_RE.test(o.r)) return null;
    if (o.t === 'desc') {
      var d = o.d;
      if (!d || (d.type !== 'offer' && d.type !== 'answer') || typeof d.sdp !== 'string' || d.sdp.length > MAX_SDP) return null;
      return { t: 'desc', s: o.s, r: o.r, d: { type: d.type, sdp: d.sdp } };
    }
    if (o.t === 'cand') {
      if (o.c === null) return { t: 'cand', s: o.s, r: o.r, c: null }; // end of candidates
      var c = o.c;
      if (!c || typeof c.c !== 'string' || c.c.length > MAX_CAND) return null;
      return { t: 'cand', s: o.s, r: o.r, c: { candidate: c.c, sdpMid: typeof c.m === 'string' ? c.m.slice(0, 32) : null,
        sdpMLineIndex: c.i === (c.i | 0) && c.i >= 0 && c.i < 16 ? c.i : null, usernameFragment: typeof c.u === 'string' ? c.u.slice(0, 64) : null } };
    }
    return null;
  }

  // Turns a snapshot of rooms/<CODE>/rtc into what changed since the last snapshot, for seat `me`:
  //   joins [{slot, sid}]: someone is in the call (a new session: a first join, or after a reload)
  //   leaves [slot]: someone's session ended (hung up, left, reloaded: a reload is a leave + a join)
  //   msgs {slot: [msg…]}: new notes for me from their CURRENT session to MY session, oldest first
  //   info {slot: {cam, mic}}: their latest "hi" flags
  function Mailbox(me) {
    me = String(me);
    var peers = {};
    return {
      reset: function () { peers = {}; },
      peers: function () { return peers; },
      read: function (tree, mySid) {
        var out = { joins: [], leaves: [], msgs: {}, info: {} };
        tree = tree && typeof tree === 'object' ? tree : {};
        SEATS.forEach(function (j) {
          if (j === me) return;
          var node = tree[j] && typeof tree[j] === 'object' ? tree[j] : null;
          var hi = parseHi(node && node.hi), cur = peers[j];
          if (!hi) { if (cur) { out.leaves.push(j); delete peers[j]; } return; }
          if (!cur || cur.sid !== hi.s) {
            if (cur) out.leaves.push(j);
            cur = peers[j] = { sid: hi.s, last: 0 };
            out.joins.push({ slot: j, sid: hi.s });
          }
          out.info[j] = { cam: hi.cam, mic: hi.mic };
          var box = node[me] && typeof node[me] === 'object' ? node[me] : null;
          if (!box) return;
          var nums = Object.keys(box).filter(function (k) { return /^[0-9]{1,4}$/.test(k) && +k > cur.last; }).map(Number).sort(function (a, b) { return a - b; });
          nums.forEach(function (k) {
            cur.last = k;
            var m = parseMsg(box[k]);
            if (!m || m.s !== hi.s || m.r !== mySid) return; // from an older session of theirs, or meant for my older session
            (out.msgs[j] = out.msgs[j] || []).push(m);
          });
        });
        return out;
      }
    };
  }

  // One link, "perfect negotiation" (both sides may offer; on a clash the polite side rolls back and answers).
  // o: { pc, polite, send(msg), log? }. pc is an RTCPeerConnection (or a pretend one in the tests).
  function Peer(o) {
    var pc = o.pc, making = false, ignoreOffer = false, settingAnswer = false, pending = [], closed = false, chain = Promise.resolve();
    var log = o.log || function () {};
    function sendDesc() { var d = pc.localDescription; if (d && !closed) o.send({ t: 'desc', d: { type: d.type, sdp: d.sdp } }); }
    function negotiate(iceRestart) {
      if (closed) return Promise.resolve();
      making = true;
      return Promise.resolve().then(function () { return pc.createOffer(iceRestart ? { iceRestart: true } : undefined); })
        .then(function (offer) { if (closed || pc.signalingState !== 'stable') return; return pc.setLocalDescription(offer).then(sendDesc); })
        .catch(function (e) { log('offer failed', e); })
        .then(function () { making = false; });
    }
    pc.onnegotiationneeded = function () { negotiate(false); };
    pc.onicecandidate = function (e) {
      if (closed) return;
      var c = e && e.candidate;
      o.send({ t: 'cand', c: c ? { c: c.candidate, m: c.sdpMid, i: c.sdpMLineIndex, u: c.usernameFragment || undefined } : null });
    };
    function addCand(c) {
      return Promise.resolve().then(function () { return pc.addIceCandidate(c); })
        .catch(function (e) { if (!ignoreOffer) log('candidate refused', e); });
    }
    function handle(m) {
      if (m.t === 'desc') {
        var d = m.d;
        var ready = !making && (pc.signalingState === 'stable' || settingAnswer);
        var clash = d.type === 'offer' && !ready;
        ignoreOffer = !o.polite && clash;
        if (ignoreOffer) { log('ignored a clashing offer'); return Promise.resolve(); }
        return Promise.resolve()
          .then(function () { if (clash) return pc.setLocalDescription({ type: 'rollback' }); })
          .then(function () { settingAnswer = d.type === 'answer'; return pc.setRemoteDescription(d); })
          .then(function () {
            settingAnswer = false;
            var q = pending; pending = [];
            return q.reduce(function (p, c) { return p.then(function () { return addCand(c); }); }, Promise.resolve());
          })
          .then(function () {
            if (d.type !== 'offer' || closed) return;
            if (o.beforeAnswer) o.beforeAnswer(pc);
            return pc.createAnswer().then(function (a) { return pc.setLocalDescription(a); }).then(sendDesc);
          })
          .catch(function (e) { settingAnswer = false; log('description failed', e); });
      }
      if (m.t === 'cand') {
        if (m.c === null) return Promise.resolve();
        if (!pc.remoteDescription) { pending.push(m.c); return Promise.resolve(); } // too early: keep it until the description is in
        return addCand(m.c);
      }
      return Promise.resolve();
    }
    return {
      pc: pc,
      // Notes are handled strictly one after another (a candidate never overtakes its description).
      handle: function (m) { chain = chain.then(function () { if (!closed) return handle(m); }); return chain; },
      negotiate: negotiate,
      restart: function () { if (o.polite) return Promise.resolve(); if (pc.restartIce) { try { pc.restartIce(); return Promise.resolve(); } catch (e) {} } return negotiate(true); },
      pendingCount: function () { return pending.length; },
      close: function () { if (closed) return; closed = true; pending = []; try { pc.onnegotiationneeded = null; pc.onicecandidate = null; pc.close(); } catch (e) {} },
      closed: function () { return closed; }
    };
  }

  // Everything one device does in the call.
  // o: { me: seat, sid?, write(relPath, value) -> Promise   (relPath is under rooms/<CODE>/rtc/)
  //      makePc(slot, starts) -> pc   (the starter adds its transceivers there, which makes it offer)
  //      onPeer(slot, link|null, info)   a link opened / closed
  //      onInfo(slot, {cam, mic})   their flags changed
  //      log? }
  function Session(o) {
    var me = String(o.me), sid = o.sid || newSid(), n = 0, mb = Mailbox(me), links = {}, live = false, flags = { cam: false, mic: true };
    var log = o.log || function () {};
    function w(path, val) { try { return Promise.resolve(o.write(path, val)); } catch (e) { return Promise.reject(e); } }
    function hiText() { return JSON.stringify({ s: sid, cam: !!flags.cam, mic: flags.mic !== false }); }
    function post(slot, msg) {
      var L = links[slot];
      if (!L || !live) return;
      if (msg.t === 'cand' && msg.c && ++L.cands > MAX_CANDS_PER_LINK) return;
      msg.s = sid; msg.r = L.sid;
      var text = JSON.stringify(msg);
      if (text.length > MAX_SDP + 400) { log('note too big', text.length); return; }
      n++; if (n > 9999) return;
      w(me + '/' + slot + '/' + n, text).catch(function (e) { log('write refused', e); });
    }
    function open(slot, theirSid) {
      close(slot);
      w(me + '/' + slot, null).catch(function () {}); // my notes to their older session are no use now
      var st = starts(me, slot);
      var link = { slot: slot, sid: theirSid, cands: 0, starts: st, polite: polite(me, slot) };
      var pc = o.makePc(slot, st);
      link.peer = Peer({ pc: pc, polite: link.polite, send: function (m) { post(slot, m); }, beforeAnswer: o.beforeAnswer ? function (p) { o.beforeAnswer(slot, p); } : null, log: function (a, b) { log('[' + slot + '] ' + a, b); } });
      links[slot] = link;
      if (o.onPeer) o.onPeer(slot, link);
      return link;
    }
    function close(slot) {
      var L = links[slot];
      if (!L) return;
      delete links[slot];
      L.peer.close();
      if (o.onPeer) o.onPeer(slot, null);
    }
    return {
      sid: function () { return sid; },
      links: function () { return links; },
      live: function () { return live; },
      // Join: clear my old notes, then say hi. Resolves when the hi is written (rejects if the database refuses).
      start: function () {
        live = true;
        return w(me, null).catch(function () {}).then(function () { return w(me + '/hi', hiText()); });
      },
      setFlags: function (f) { Object.keys(f || {}).forEach(function (k) { flags[k] = f[k]; }); if (live) return w(me + '/hi', hiText()).catch(function () {}); return Promise.resolve(); },
      onTree: function (tree) {
        if (!live) return;
        var ev = mb.read(tree, sid);
        ev.leaves.forEach(close);
        ev.joins.forEach(function (j) { open(j.slot, j.sid); });
        Object.keys(ev.info).forEach(function (k) { if (o.onInfo) o.onInfo(k, ev.info[k]); });
        Object.keys(ev.msgs).forEach(function (k) { var L = links[k]; if (L) ev.msgs[k].forEach(function (m) { L.peer.handle(m); }); });
        return ev;
      },
      // A fresh session (after this device lost its connection to the database): everybody reconnects to me.
      renew: function () {
        Object.keys(links).forEach(close); mb.reset(); sid = newSid(); n = 0;
        if (!live) return Promise.resolve();
        return w(me, null).catch(function () {}).then(function () { return w(me + '/hi', hiText()); });
      },
      restart: function (slot) { var L = links[slot]; if (L) return L.peer.restart(); },
      stop: function () {
        if (!live) return Promise.resolve();
        live = false;
        Object.keys(links).forEach(close); mb.reset();
        return w(me, null).catch(function () {});
      }
    };
  }

  return { Mailbox: Mailbox, Peer: Peer, Session: Session, parseHi: parseHi, parseMsg: parseMsg, polite: polite, starts: starts, newSid: newSid,
    MAX_SDP: MAX_SDP, MAX_CANDS_PER_LINK: MAX_CANDS_PER_LINK };
})();
/*CORE-END*/

// ======================= PAGE PART =======================
// Public: VoiceChat.room(code, seat, namesFn, refreshFn) when this device is in an online room (host or guest),
//         VoiceChat.leaveRoom() when it leaves, VoiceChat.lobbyHTML() for the lobby pop-ups,
//         VoiceChat.parentHTML() for Settings → Parent corner, VoiceChat.seatGone(seat) (host: clean a freed seat),
//         VoiceChat.allowed(), VoiceChat.talking() (is anybody else talking right now: for the music).
// Music hook: while someone else talks, Snd.duckTalk(true) is called if js/sound.js has it (see the handoff), and a
// 'tata:talking' event ({detail: {on}}) is sent on window either way.
var VoiceChat = (typeof window === 'undefined') ? null : (function () {
  var NetX = window.Net || null;
  var q = location.search;
  var TEST = !!(NetX && NetX.test);
  var FAKE = TEST || /[?&]fakemedia=1(&|$)/.test(q);   // fake microphone + camera: no permission prompt at all
  var SUFFIX = TEST ? '.test.' + NetX.profile : '';
  var ALLOW_KEY = 'tataVoice.allowed' + SUFFIX, POS_KEY = 'tataVoice.pos' + SUFFIX, DOCK_KEY = 'tataVoice.dock' + SUFFIX, CALL_KEY = 'tataVoice.call' + SUFFIX;
  // Public STUN servers (they only tell a device its own public address; no sound passes through them).
  var STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
  var FAIL_MS = 10000;
  var AUDIO_C = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
  var VIDEO_C = { facingMode: 'user', width: { ideal: 240, max: 320 }, height: { ideal: 180, max: 240 }, frameRate: { ideal: 12, max: 15 } };
  var NO_NET = 'Voice could not connect on this network. You can still play; use the phone or FaceTime to talk.';
  var NO_RULES = 'Tata needs to switch talking on first (one step in the game\'s online setup). You can still play; use the phone or FaceTime to talk.';

  var R = null;            // the room: { code, slot, names(seat), refresh() }
  var tree = null;         // last rtc snapshot
  var unsub = null, offConn = null, offDisc = null, wasOffline = false;
  var sess = null;
  var st = { busy: false, inCall: false, cam: false, micOff: false, spkOff: false, refused: false, denied: false, camDenied: false, needTap: false, again: false, asking: false, unsupported: false };
  var local = { audio: null, video: null, fakeStop: null, fakeCamStop: null };
  var peers = {};          // seat -> { pc, link, audio, vstream, info, timer, ok, failed, restarted, an, stats }
  var ctx = null, meAn = null, levelTimer = null, statsTimer = null, wake = null, ducked = false, block = false, declineTest = false, dcTimer = null, uiTimer = null;

  function E(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, ''); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function allowed() { return lsGet(ALLOW_KEY) === '1'; }
  function supported() { return !!(window.RTCPeerConnection && (FAKE || (navigator.mediaDevices && navigator.mediaDevices.getUserMedia))); }
  function base() { return 'rooms/' + R.code + '/rtc/'; }
  function name(s) { try { return (R && R.names && R.names(+s)) || 'Player'; } catch (e) { return 'Player'; } }
  function others() { return Object.keys(peers); }
  function log(a, b) { if (window.console && (TEST || window.TATA_VOICE_DEBUG)) console.log('[voice]', a, b === undefined ? '' : (b && b.message) || b); }
  function rtcWrite(path, val) { return NetX.rtcWrite ? NetX.rtcWrite(path, val) : NetX.write(path, val); }

  // ---------------------------------------------------------------- the room
  function room(code, slot, names, refresh) {
    if (R && R.code === code && R.slot === slot) { R.names = names; R.refresh = refresh; return; }
    if (R) leaveRoom(); // another room: the old one's call ends
    R = { code: code, slot: slot, names: names, refresh: refresh };
    clearInterval(uiTimer); uiTimer = setInterval(function () { if (st.inCall || st.busy || st.again || st.refused || document.getElementById('vcDock')) { renderDock(); renderBubbles(); } }, 600); // pop-ups open and close on their own
    st.refused = false;
    if (allowed() && supported()) watch();
  }
  function watch() {
    if (!R || unsub || !NetX) return;
    unsub = NetX.subscribe(base().slice(0, -1), onTree);
    if (NetX.connection) offConn = NetX.connection(function (ok) {
      if (!ok) { wasOffline = true; return; }
      if (wasOffline && sess) { log('back online: new session'); sess.renew(); armDisconnect(); }
      wasOffline = false;
    });
    var c = null; try { c = JSON.parse(lsGet(CALL_KEY)); } catch (e) {}
    if (c && c.code === R.code && c.slot === R.slot && Date.now() - (c.t || 0) < 6 * 3600 * 1000 && !st.inCall && !st.busy) rejoin(c);
  }
  function onTree(v) {
    tree = v && typeof v === 'object' ? v : {};
    if (sess) sess.onTree(block ? blocked(tree) : tree);
    refreshUI();
  }
  // Testing "a network where nothing connects": every candidate is dropped, both ways.
  function blocked(t) {
    var out = JSON.parse(JSON.stringify(t || {})), me = String(R.slot);
    Object.keys(out).forEach(function (j) {
      var box = out[j] && out[j][me];
      if (!box || typeof box !== 'object') return;
      Object.keys(box).forEach(function (k) {
        try { var m = JSON.parse(box[k]); if (m.t === 'cand') delete box[k]; else if (m.d) { m.d.sdp = stripCands(m.d.sdp); box[k] = JSON.stringify(m); } } catch (e) {}
      });
    });
    return out;
  }
  function stripCands(sdp) { return String(sdp || '').split(/\r\n/).filter(function (l) { return l.indexOf('a=candidate') !== 0 && l.indexOf('a=end-of-candidates') !== 0; }).join('\r\n'); }
  function inCallList() { // who has "hi" in the room right now (for the lobby)
    var out = {}; if (!tree) return out;
    Object.keys(tree).forEach(function (j) { var h = VoiceCore.parseHi(tree[j] && tree[j].hi); if (h) out[j] = h; });
    return out;
  }

  // ---------------------------------------------------------------- media
  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {}); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {}); } catch (e) { ctx = null; }
    return ctx;
  }
  function fakeMic() {
    var c = ensureCtx();
    if (!c || !c.createMediaStreamDestination) return null;
    var osc = c.createOscillator(), g = c.createGain(), dest = c.createMediaStreamDestination();
    var f = { a: 330, b: 440, c: 554 }[NetX && NetX.profile] || 392;
    osc.type = 'triangle'; osc.frequency.value = f; g.gain.value = 0;
    osc.connect(g); g.connect(dest); osc.start();
    var on = false, t = setInterval(function () { on = !on; try { g.gain.setTargetAtTime(on ? 0.25 : 0, c.currentTime, 0.02); } catch (e) {} }, 1300); // "talks" in bursts
    local.fakeStop = function () { clearInterval(t); try { osc.stop(); osc.disconnect(); g.disconnect(); } catch (e) {} };
    return dest.stream.getAudioTracks()[0] || null;
  }
  function fakeCam() {
    var cv = document.createElement('canvas'); cv.width = 160; cv.height = 120;
    if (!cv.captureStream) return null;
    var g = cv.getContext('2d'), col = { a: '#2f8cff', b: '#22b573', c: '#ff8a1f' }[NetX && NetX.profile] || '#7a3cf0', k = 0;
    var draw = function () {
      k++; g.fillStyle = col; g.fillRect(0, 0, 160, 120);
      g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.fillText(((NetX && NetX.profile) || '?').toUpperCase(), 80, 82);
      g.beginPath(); g.arc(80 + 60 * Math.cos(k / 6), 60 + 40 * Math.sin(k / 6), 8, 0, 7); g.fill();
    };
    draw(); var t = setInterval(draw, 100);
    var track = cv.captureStream(10).getVideoTracks()[0] || null;
    local.fakeCamStop = function () { clearInterval(t); };
    return track;
  }
  function gum(c) {
    if (declineTest) { var e = new Error('Permission denied (test)'); e.name = 'NotAllowedError'; return Promise.reject(e); }
    return navigator.mediaDevices.getUserMedia(c);
  }
  function getMic() {
    if (declineTest) return gum({});
    if (FAKE) return Promise.resolve(fakeMic());
    return gum({ audio: AUDIO_C, video: false }).then(function (s) { return s.getAudioTracks()[0] || null; });
  }
  function getCam() {
    if (declineTest) return gum({});
    if (FAKE) return Promise.resolve(fakeCam());
    return gum({ audio: false, video: VIDEO_C }).then(function (s) { var t = s.getVideoTracks()[0] || null; if (t && 'contentHint' in t) t.contentHint = 'motion'; return t; });
  }
  function watchTrack(t, kind) { if (t) t.onended = function () { if (kind === 'audio' && local.audio === t) deviceChanged(true); if (kind === 'video' && local.video === t) setCam(false); }; }
  function stopMedia() {
    [local.audio, local.video].forEach(function (t) { if (t) { try { t.onended = null; t.stop(); } catch (e) {} } });
    if (local.fakeStop) local.fakeStop(); if (local.fakeCamStop) local.fakeCamStop();
    local = { audio: null, video: null, fakeStop: null, fakeCamStop: null };
    meAn = null;
  }

  // ---------------------------------------------------------------- joining the call (always after a tap)
  function talk(withCam) {
    if (!R || st.busy || st.inCall || !allowed()) return;
    if (!supported()) { st.unsupported = true; refreshUI(); return; }
    st.busy = true; st.again = false; st.denied = false; st.camDenied = false; st.refused = false; refreshUI();
    if (!unsub) watch();
    ensureCtx();
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {} // iOS: the game's sounds keep playing with the mic on
    getMic().then(function (t) { local.audio = t; watchTrack(t, 'audio'); if (!t) st.denied = true; }, function (e) { log('no microphone', e); st.denied = true; })
      .then(function () {
        if (!withCam) return;
        return getCam().then(function (t) { local.video = t; watchTrack(t, 'video'); st.cam = !!t; }, function (e) { log('no camera', e); st.camDenied = true; st.cam = false; });
      })
      .then(function () {
        try { if (window.Snd && Snd.init) Snd.init(); } catch (e) {} // iOS may pause the game's sounds when the mic starts
        if (local.audio && st.micOff) local.audio.enabled = false;
        return startSession();
      })
      .catch(function (e) { log('talk failed', e); st.busy = false; stopMedia(); refreshUI(); });
  }
  function startSession() {
    if (!R) { st.busy = false; stopMedia(); return; }
    var r = R;
    sess = VoiceCore.Session({
      me: r.slot,
      write: function (p, v) {
        if (block && v && /\/[0-9]\/[0-9]+$/.test(p)) { try { var m = JSON.parse(v); if (m.t === 'cand') return Promise.resolve(); if (m.d) { m.d.sdp = stripCands(m.d.sdp); v = JSON.stringify(m); } } catch (e) {} }
        return rtcWrite(base() + p, v);
      },
      makePc: makePc, onPeer: onPeer, onInfo: onInfo, beforeAnswer: beforeAnswer, log: log
    });
    sess.setFlags({ cam: !!(st.cam && local.video), mic: !!(local.audio && !st.micOff) });
    return sess.start().then(function () {
      if (R !== r || !sess) return;
      st.busy = false; st.inCall = true; st.refused = false;
      lsSet(CALL_KEY, JSON.stringify({ code: r.code, slot: r.slot, cam: st.cam, t: Date.now() }));
      armDisconnect(); startTimers(); keepAwake(true);
      if (tree) onTree(tree);
      refreshUI();
    }, function (e) {
      log('the database refused the talking notes', e);
      if (sess) { var s = sess; sess = null; s.stop(); }
      st.busy = false; st.refused = true; stopMedia(); refreshUI();
    });
  }
  function armDisconnect() { if (offDisc) { try { offDisc(); } catch (e) {} } offDisc = (R && NetX.rtcOnDisconnect) ? NetX.rtcOnDisconnect(base() + R.slot) : null; }
  // After a reload: rejoin by itself only when no question would pop up (fake media, or the mic is already allowed);
  // otherwise the floating control offers "🎙 Talk again" (the browser's question must follow a tap).
  function rejoin(c) {
    var go = function () { talk(!!c.cam); };
    if (FAKE) { setTimeout(go, 300); return; }
    var ask = function () { st.again = true; st.cam = !!c.cam; refreshUI(); };
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' }).then(function (p) { if (p.state === 'granted') go(); else ask(); }, ask);
        return;
      }
    } catch (e) {}
    ask();
  }
  function hangUp(keepCall) {
    var hadCall = st.inCall || st.busy || !!sess || st.again;
    if (sess) { var s = sess; sess = null; s.stop(); }
    Object.keys(peers).forEach(dropPeer);
    if (offDisc) { try { offDisc(); } catch (e) {} offDisc = null; }
    stopMedia(); stopTimers(); keepAwake(false); duck(false);
    st.inCall = false; st.busy = false; st.cam = false; st.needTap = false; st.again = false;
    if (!keepCall) lsSet(CALL_KEY, null);
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch (e) {}
    if (hadCall) refreshUI();
  }
  // Leaving the room: hang up, stop listening.
  function leaveRoom() {
    hangUp(false);
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    if (offConn) { try { offConn(); } catch (e) {} offConn = null; }
    clearInterval(uiTimer); uiTimer = null;
    R = null; tree = null; st.asking = false; st.refused = false;
    removeDock();
  }
  // Host: a guest's seat was freed; their old notes (if any) go too.
  function seatGone(s) { if (R && R.slot === 0 && s !== 0 && tree && tree[s]) rtcWrite(base() + s, null).catch(function () {}); }

  // ---------------------------------------------------------------- links
  function makePc(slot, starts) {
    var pc = new RTCPeerConnection({ iceServers: TEST ? [] : STUN, bundlePolicy: 'max-bundle' });
    var p = peers[slot] = peers[slot] || {};
    p.pc = pc; p.ok = false; p.failed = false; p.restarted = false; p.stats = {}; p.vstream = null;
    if (starts) {
      addTx(pc, 'audio', local.audio, [{ priority: 'high', networkPriority: 'high', maxBitrate: 40000 }]);
      addTx(pc, 'video', st.cam ? local.video : null, [{ maxBitrate: 150000, maxFramerate: 15 }]);
    }
    pc.ontrack = function (e) { gotTrack(slot, pc, e.track); };
    pc.oniceconnectionstatechange = function () { onIce(slot, pc); };
    return pc;
  }
  function addTx(pc, kind, track, enc) {
    try { pc.addTransceiver(track || kind, { direction: 'sendrecv', sendEncodings: enc }); }
    catch (e) { try { pc.addTransceiver(track || kind, { direction: 'sendrecv' }); } catch (e2) { log('addTransceiver failed', e2); } }
  }
  function kindOf(t) { return (t.receiver && t.receiver.track && t.receiver.track.kind) || (t.sender && t.sender.track && t.sender.track.kind) || ''; }
  // The answering side sends on the transceivers the offer made (so camera on/off never needs a new negotiation).
  function beforeAnswer(slot, pc) {
    pc.getTransceivers().forEach(function (t) {
      var k = kindOf(t);
      if (k !== 'audio' && k !== 'video') return;
      try { t.direction = 'sendrecv'; } catch (e) {}
      var want = k === 'audio' ? local.audio : (st.cam ? local.video : null);
      if (t.sender.track !== want) t.sender.replaceTrack(want).catch(function () {});
    });
  }
  function senders(kind) {
    var out = [];
    others().forEach(function (s) { var p = peers[s]; if (!p.pc || p.pc.signalingState === 'closed') return; p.pc.getTransceivers().forEach(function (t) { if (kindOf(t) === kind && t.sender) out.push(t.sender); }); });
    return out;
  }
  // Small pictures, low frame rate; the voice goes first when the network is slow.
  function tune(pc) {
    pc.getSenders().forEach(function (s) {
      var k = s.track ? s.track.kind : null; if (!k || !s.getParameters || !s.setParameters) return;
      try {
        var prm = s.getParameters(); if (!prm.encodings || !prm.encodings.length) return;
        if (k === 'video') { prm.encodings[0].maxBitrate = 150000; prm.encodings[0].maxFramerate = 15; }
        else { prm.encodings[0].priority = 'high'; prm.encodings[0].networkPriority = 'high'; }
        s.setParameters(prm).catch(function () {});
      } catch (e) {}
    });
  }
  function onPeer(slot, link) {
    if (!link) { dropPeer(slot); refreshUI(); return; }
    var p = peers[slot] = peers[slot] || {};
    p.link = link; p.info = p.info || { cam: false, mic: true };
    clearTimeout(p.timer);
    p.timer = setTimeout(function () { checkFail(slot); }, FAIL_MS);
    refreshUI();
  }
  function dropPeer(slot) {
    var p = peers[slot]; if (!p) return;
    clearTimeout(p.timer); clearTimeout(p.retry);
    try { if (p.pc && p.pc.signalingState !== 'closed') p.pc.close(); } catch (e) {}
    if (p.audio) { try { p.audio.pause(); p.audio.srcObject = null; p.audio.remove(); } catch (e) {} }
    if (p.an) { try { p.an.src.disconnect(); } catch (e) {} }
    delete peers[slot];
    var b = document.getElementById('vcBub' + slot); if (b) b.remove();
  }
  function onInfo(slot, f) { var p = peers[slot]; if (!p) return; var was = JSON.stringify(p.info || {}); p.info = f; if (was !== JSON.stringify(f)) refreshUI(); }
  function onIce(slot, pc) {
    var p = peers[slot]; if (!p || p.pc !== pc) return;
    var s = pc.iceConnectionState;
    log('[' + slot + '] ice ' + s);
    if (s === 'connected' || s === 'completed') {
      clearTimeout(p.retry); clearTimeout(p.timer); p.ok = true; p.failed = false; tune(pc); refreshUI();
    } else if (s === 'failed') {
      p.ok = false; checkFail(slot);
    } else if (s === 'disconnected') {
      p.ok = false; refreshUI();
      clearTimeout(p.retry);
      p.retry = setTimeout(function () { if (peers[slot] === p && pc.iceConnectionState === 'disconnected' && sess) sess.restart(slot); }, 4000);
      clearTimeout(p.timer); p.timer = setTimeout(function () { checkFail(slot); }, FAIL_MS);
    }
  }
  function checkFail(slot) {
    var p = peers[slot]; if (!p || p.ok) return;
    p.failed = true;
    if (!p.restarted && sess) { p.restarted = true; sess.restart(slot); }
    refreshUI();
  }
  function gotTrack(slot, pc, track) {
    var p = peers[slot]; if (!p || p.pc !== pc) return;
    if (track.kind === 'audio') {
      if (!p.audio) {
        p.audio = document.createElement('audio'); p.audio.autoplay = true; p.audio.setAttribute('playsinline', ''); p.audio.className = 'vc-audio';
        document.body.appendChild(p.audio);
      }
      p.audio.srcObject = new MediaStream([track]);
      p.audio.muted = st.spkOff;
      playAudio(p.audio);
      p.an = analyser(new MediaStream([track]));
    } else if (track.kind === 'video') {
      p.vstream = new MediaStream([track]);
    }
    refreshUI();
  }
  // Autoplay rules (iOS Safari, Chrome): if the browser refuses to start the sound, the control shows "Tap to hear".
  function playAudio(a) {
    var pr = null; try { pr = a.play(); } catch (e) {}
    if (pr && pr.catch) pr.then(function () { if (st.needTap && everyonePlays()) { st.needTap = false; refreshUI(); } }, function () { st.needTap = true; refreshUI(); });
  }
  function everyonePlays() { return others().every(function (s) { var a = peers[s].audio; return !a || !a.paused; }); }

  // ---------------------------------------------------------------- buttons
  function setMic(off) {
    st.micOff = off;
    if (local.audio) local.audio.enabled = !off;
    if (sess) sess.setFlags({ mic: !!(local.audio && !off) });
    refreshUI();
  }
  function setSpeaker(off) { st.spkOff = off; others().forEach(function (s) { var a = peers[s].audio; if (a) a.muted = off; }); if (off) duck(false); refreshUI(); }
  function setCam(on) {
    if (on && !local.video) {
      if (st.busy) return;
      st.busy = true; refreshUI();
      getCam().then(function (t) {
        st.busy = false;
        if (!sess) { if (t) t.stop(); refreshUI(); return; }
        local.video = t; watchTrack(t, 'video'); st.cam = !!t; st.camDenied = !t;
        senders('video').forEach(function (s) { s.replaceTrack(t).catch(function () {}); });
        sess.setFlags({ cam: !!t }); lsCall(); refreshUI();
      }, function (e) { log('no camera', e); st.busy = false; st.camDenied = true; st.cam = false; refreshUI(); });
      return;
    }
    if (!on) {
      senders('video').forEach(function (s) { s.replaceTrack(null).catch(function () {}); });
      if (local.video) { try { local.video.onended = null; local.video.stop(); } catch (e) {} }
      if (local.fakeCamStop) { local.fakeCamStop(); local.fakeCamStop = null; }
      local.video = null; st.cam = false;
      if (sess) sess.setFlags({ cam: false });
      lsCall(); refreshUI();
    }
  }
  function lsCall() { var c = null; try { c = JSON.parse(lsGet(CALL_KEY)); } catch (e) {} if (c) { c.cam = st.cam; lsSet(CALL_KEY, JSON.stringify(c)); } }
  // Headphones plugged in / pulled out, or the microphone went away: take the (new) default microphone.
  function deviceChanged(now) {
    if (FAKE || !sess || (!local.audio && !now)) return;
    clearTimeout(dcTimer);
    dcTimer = setTimeout(function () {
      if (!sess) return;
      gum({ audio: AUDIO_C, video: false }).then(function (s) {
        var t = s.getAudioTracks()[0]; if (!t || !sess) { if (t) t.stop(); return; }
        var old = local.audio;
        if (old && old.readyState === 'live' && old.getSettings && t.getSettings && old.getSettings().deviceId === t.getSettings().deviceId) { t.stop(); return; }
        t.enabled = !st.micOff; local.audio = t; watchTrack(t, 'audio'); meAn = null;
        senders('audio').forEach(function (snd) { snd.replaceTrack(t).catch(function () {}); });
        if (old) { try { old.onended = null; old.stop(); } catch (e) {} }
        log('microphone switched');
      }, function (e) { log('microphone switch failed', e); });
    }, now ? 50 : 700);
  }
  try { if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', function () { deviceChanged(false); }); } catch (e) {}

  // ---------------------------------------------------------------- talking rings, music, connection dot
  function analyser(stream) {
    var c = ensureCtx(); if (!c || !c.createMediaStreamSource) return null;
    try { var src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 512; src.connect(an); return { src: src, an: an, buf: new Float32Array(an.fftSize), on: false, quiet: 0 }; } catch (e) { return null; }
  }
  function level(a) {
    if (!a || !a.an.getFloatTimeDomainData) return 0;
    a.an.getFloatTimeDomainData(a.buf);
    var s = 0; for (var i = 0; i < a.buf.length; i++) s += a.buf[i] * a.buf[i];
    return Math.sqrt(s / a.buf.length);
  }
  function speaking(a, muted) {
    if (!a) return false;
    var l = muted ? 0 : level(a);
    if (l > 0.03) { a.on = true; a.quiet = 0; } else if (a.on && ++a.quiet > 3) a.on = false; // stays lit ~0.5 s after the last sound
    return a.on;
  }
  function startTimers() {
    stopTimers();
    levelTimer = setInterval(function () {
      if (local.audio && (!meAn || meAn.track !== local.audio)) { meAn = analyser(new MediaStream([local.audio])); if (meAn) meAn.track = local.audio; }
      ring('me', speaking(meAn, st.micOff || !local.audio));
      var any = false;
      others().forEach(function (s) { var p = peers[s], on = speaking(p.an, !p.ok || (p.info && p.info.mic === false)); ring(s, on); if (on) any = true; });
      duck(any && !st.spkOff);
    }, 140);
    statsTimer = setInterval(stats, 2000);
  }
  function stopTimers() { clearInterval(levelTimer); clearInterval(statsTimer); levelTimer = statsTimer = null; ring('me', false); }
  function ring(who, on) {
    document.querySelectorAll('[data-vc-ring="' + who + '"]').forEach(function (el) { if (el.classList.contains('vc-talk') !== on) el.classList.toggle('vc-talk', on); });
  }
  function duck(on) {
    if (on === ducked) return; ducked = on;
    try { if (window.Snd && Snd.duckTalk) Snd.duckTalk(on); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('tata:talking', { detail: { on: on } })); } catch (e) {}
  }
  function stats() {
    others().forEach(function (s) {
      var p = peers[s]; if (!p.pc || !p.pc.getStats) return;
      p.pc.getStats().then(function (rep) {
        var o = { bytesIn: 0, bytesOut: 0, rtt: null, lost: 0, got: 0, audioIn: 0, videoIn: 0 };
        rep.forEach(function (r) {
          if (r.type === 'inbound-rtp') { o.bytesIn += r.bytesReceived || 0; if (r.kind === 'audio' || r.mediaType === 'audio') { o.lost += r.packetsLost || 0; o.got += r.packetsReceived || 0; o.audioIn += r.bytesReceived || 0; } else o.videoIn += r.bytesReceived || 0; }
          if (r.type === 'outbound-rtp') o.bytesOut += r.bytesSent || 0;
          if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number') o.rtt = r.currentRoundTripTime;
        });
        var prev = p.stats || {}, dl = o.lost - (prev.lost || 0), dg = o.got - (prev.got || 0);
        var loss = dg + dl > 0 ? dl / (dg + dl) : 0;
        o.q = !p.ok ? 'off' : ((o.rtt !== null && o.rtt > 0.6) || loss > 0.1) ? 'poor' : ((o.rtt !== null && o.rtt > 0.3) || loss > 0.03) ? 'ok' : 'good';
        o.ice = p.pc.iceConnectionState;
        p.stats = o;
        var d = document.getElementById('vcDot'); if (d) { var qq = quality(); if (d.dataset.q !== qq) { d.dataset.q = qq; d.title = QTXT[qq]; d.setAttribute('aria-label', QTXT[qq]); } }
      }).catch(function () {});
    });
  }
  var QTXT = { good: 'Sound: good connection', ok: 'Sound: a bit slow', poor: 'Sound: poor connection', off: 'Connecting…', none: 'Nobody else is in the talk yet' };
  function quality() {
    var ks = others(); if (!ks.length) return 'none';
    var rank = { good: 0, ok: 1, poor: 2, off: 3 }, worst = 'good';
    ks.forEach(function (s) { var p = peers[s], qq = p.ok ? ((p.stats && p.stats.q) || 'good') : 'off'; if (rank[qq] > rank[worst]) worst = qq; });
    return worst;
  }
  // iPad / phone: keep the screen awake while talking.
  function keepAwake(on) {
    if (!on) { if (wake) { try { wake.release(); } catch (e) {} wake = null; } return; }
    if (!navigator.wakeLock || wake || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { if (wake === w) wake = null; }); }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !st.inCall) return;
    keepAwake(true); ensureCtx();
    others().forEach(function (s) { var a = peers[s].audio; if (a && a.paused) playAudio(a); });
  });
  // Closing / reloading the page: everything stops and the notes go (a reload rejoins by itself, see rejoin()).
  window.addEventListener('pagehide', function () { if (sess || st.inCall) hangUp(true); });

  // ---------------------------------------------------------------- words
  var SAFETY = '<div class="vc-safe"><b>Talking in online games</b><ul>' +
    '<li>Only the people in this game room (they have the code) are connected.</li>' +
    '<li>Nothing is recorded or stored.</li>' +
    '<li>Anyone can hang up at any time.</li></ul>' +
    '<p>The browser asks before it uses the microphone (and the camera, for “See each other”).</p></div>';
  var SMALL = '<p class="vc-small">Only the people in this game hear you. Nothing is recorded. Hang up any time.</p>';

  // ---------------------------------------------------------------- lobby block (inside the online lobby pop-ups)
  function peerLine() {
    var on = inCallList(), me = R ? String(R.slot) : '';
    var names = Object.keys(on).filter(function (j) { return j !== me; }).map(function (j) { return '<b>' + E(name(j)) + '</b>'; });
    return names.length ? '<p class="vc-small">🎙 ' + names.join(' and ') + (names.length > 1 ? ' are' : ' is') + ' ready to talk.</p>' : '';
  }
  function chips(cls) {
    var ks = others();
    if (!ks.length) return '<span class="vc-chip ' + (cls || '') + ' vc-wait">Waiting for the others to tap 🎙 Talk…</span>';
    return ks.map(function (s) {
      var p = peers[s], state = p.ok ? '' : (p.failed ? ' ✕' : ' …');
      return '<span class="vc-chip ' + (cls || '') + (p.ok ? ' vc-ok' : '') + '" data-vc-ring="' + s + '">' + E(name(s)) + (p.info && p.info.mic === false ? ' 🔇' : '') + state + '</span>';
    }).join('');
  }
  function notes() {
    var out = [];
    if (others().some(function (s) { return peers[s].failed && !peers[s].ok; })) out.push(NO_NET);
    if (st.denied && st.inCall) out.push('The microphone isn\'t allowed on this device, so the others can\'t hear you. You can still hear them.');
    if (st.camDenied) out.push('The camera isn\'t allowed on this device. Talking still works.');
    return out.map(function (t) { return '<p class="vc-note">' + E(t) + '</p>'; }).join('');
  }
  function lobbyHTML() {
    if (!R) return '';
    var h = '<div class="vc-lobby" id="vcLobby">';
    if (!supported()) h += '<p class="vc-note">🎙 Talking inside the game doesn\'t work in this browser. Use the phone or FaceTime to talk.</p>';
    else if (!allowed()) {
      if (!st.asking) h += '<div class="vc-row"><span>🎙 Talk inside the game, instead of FaceTime?</span><button class="btn small" data-act="vcAsk">Ask a grown-up</button></div>';
      else h += SAFETY + '<div class="vc-row">' + holdBtn('Grown-ups: press and hold to allow') + '<button class="btn small" data-act="vcNotNow">Not now</button></div>';
    } else if (st.refused) {
      h += '<p class="vc-note">' + E(NO_RULES) + '</p><div class="vc-row"><button class="btn small" data-act="vcTalk">Try again</button></div>';
    } else if (!st.inCall) {
      h += '<div class="vc-row">' + (st.busy ? '<span class="vc-wait">🎙 Getting ready…</span>' :
        '<button class="btn green" data-act="vcTalk">🎙 Talk</button><button class="btn" data-act="vcTalk" data-arg="cam">📷 See each other</button>') + '</div>' + peerLine() + SMALL;
    } else {
      h += '<div class="vc-row"><span class="vc-chip vc-me" data-vc-ring="me">🎙 You' + (st.micOff || !local.audio ? ' 🔇' : '') + '</span>' + chips() + '</div>' +
        '<div class="vc-row">' + micBtn('btn small') + camBtn('btn small') + '<button class="btn small pink" data-act="vcHang">Hang up</button></div>' + notes();
    }
    return h + '</div>';
  }
  function micBtn(c) { return '<button class="' + c + (st.micOff ? '' : ' green') + '" data-act="vcMic" aria-pressed="' + (!st.micOff) + '"' + (local.audio ? '' : ' disabled') + '>' + (st.micOff || !local.audio ? '🔇 Mic off' : '🎙 Mic on') + '</button>'; }
  function camBtn(c) { return '<button class="' + c + (st.cam ? ' green' : '') + '" data-act="vcCam" aria-pressed="' + st.cam + '">' + (st.cam ? '📷 Camera on' : '📷 Camera off') + '</button>'; }
  function holdBtn(label) { return '<button class="btn small green vc-hold" data-vc-hold="1" type="button"><span class="vc-fill" aria-hidden="true"></span><span class="vc-hl">' + E(label) + '</span></button>'; }

  // ---------------------------------------------------------------- Settings → Parent corner
  function parentHTML() {
    var on = allowed();
    return '<div class="setrow"><label>Allow talking in online games<br><small style="font-weight:600">Voice (and video, if wanted) with the other players of an online game, on this device only. ' +
      'Only the people in that game room are connected; nothing is recorded or stored; anyone can hang up. Off until a grown-up allows it.</small></label>' +
      (on ? '<button class="btn small green" data-act="vcAllowOff">✔ Allowed</button>' : holdBtn('Press and hold to allow')) + '</div>';
  }

  // Press and hold for 2 seconds (the same grown-up gate as the "For Tata" page). No looping animation: one fill.
  var hold = null;
  function holdStart(e) {
    var el = e.target.closest && e.target.closest('[data-vc-hold]'); if (!el) return;
    e.preventDefault(); holdEnd();
    el.classList.add('vc-holding');
    hold = { el: el, t: setTimeout(function () { var x = hold; hold = null; if (!x) return; x.el.classList.remove('vc-holding'); setAllowed(true); }, 2000) };
  }
  function holdEnd() { if (!hold) return; clearTimeout(hold.t); hold.el.classList.remove('vc-holding'); hold = null; }
  document.addEventListener('pointerdown', holdStart);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (hold && (ev !== 'pointerleave' || e.target === hold.el)) holdEnd(); }, true); });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('[data-vc-hold]')) e.preventDefault(); });
  function setAllowed(v) {
    lsSet(ALLOW_KEY, v ? '1' : null);
    st.asking = false;
    try { if (v && window.Snd && Snd.chime) Snd.chime(); } catch (e) {}
    if (!v) { hangUp(false); if (unsub) { try { unsub(); } catch (e) {} unsub = null; } if (offConn) { try { offConn(); } catch (e) {} offConn = null; } tree = null; }
    else if (R && supported()) watch();
    try { var sb = document.getElementById('settings'); if (sb && sb.classList.contains('on') && typeof renderSettings === 'function') renderSettings(); } catch (e) {}
    refreshUI(true);
  }

  // ---------------------------------------------------------------- floating control + video bubbles
  var lastLobby = '', lastDock = '';
  function lobbyOpen() { var l = document.getElementById('vcLobby'), m = document.getElementById('modal'); return !!(l && m && m.classList.contains('on') && m.contains(l)); }
  function refreshUI(force) {
    renderDock(); renderBubbles();
    var on = inCallList();
    var sig = [allowed(), st.asking, st.refused, st.busy, st.inCall, st.cam, st.micOff, st.denied, st.camDenied, !!local.audio, Object.keys(on).join(),
      others().map(function (s) { var p = peers[s]; return s + (p.ok ? 'k' : '') + (p.failed ? 'f' : '') + (p.info && p.info.mic === false ? 'm' : ''); }).join()].join('|');
    if ((force || sig !== lastLobby) && R && R.refresh && lobbyOpen()) { lastLobby = sig; try { R.refresh(); } catch (e) {} }
    else lastLobby = sig;
  }
  function dockHTML() {
    if (st.refused && !st.inCall) return '<p class="vc-note">' + E(NO_RULES) + '</p><button class="vc-b vc-wide" data-act="vcDismiss">OK</button>';
    if (st.again) return '<button class="vc-b vc-wide green" data-act="vcAgain">🎙 Talk again</button><button class="vc-b" data-act="vcForget" title="Not now" aria-label="Not now">✕</button>';
    if (st.busy && !st.inCall) return '<span class="vc-wait">🎙 Getting ready…</span>';
    var q = quality();
    return '<span class="vc-btns"><span class="vc-grip" title="Drag to move" aria-hidden="true">⠿</span><span id="vcDot" class="vc-dot" data-q="' + q + '" title="' + QTXT[q] + '" role="img" aria-label="' + QTXT[q] + '"></span>' +
      '<button class="vc-b' + (st.micOff || !local.audio ? ' off' : '') + '" data-act="vcMic" data-vc-ring="me" title="' + (st.micOff ? 'Microphone off: tap to talk' : 'Microphone on: tap to mute') + '" aria-label="Microphone" aria-pressed="' + !(st.micOff || !local.audio) + '"' + (local.audio ? '' : ' disabled') + '>' + (st.micOff || !local.audio ? '🔇' : '🎙') + '</button>' +
      '<button class="vc-b' + (st.spkOff ? ' off' : '') + '" data-act="vcSpk" title="' + (st.spkOff ? 'Sound of the others: off' : 'Sound of the others: on') + '" aria-label="Speaker" aria-pressed="' + !st.spkOff + '">' + (st.spkOff ? '🔈' : '🔊') + '</button>' +
      '<button class="vc-b' + (st.cam ? '' : ' off') + '" data-act="vcCam" title="' + (st.cam ? 'Camera on: tap to switch off' : 'Camera off: tap to switch on') + '" aria-label="Camera" aria-pressed="' + st.cam + '">📷</button>' +
      '<button class="vc-b red" data-act="vcHang" title="Hang up" aria-label="Hang up">✕</button></span>' +
      '<span class="vc-peers">' + chips('vc-mini') + '</span>' +
      (st.needTap ? '<button class="vc-b vc-wide green" data-act="vcHear">🔈 Tap to hear the others</button>' : '') +
      notes();
  }
  function renderDock() {
    var show = !!R && (st.inCall || st.busy || st.again || st.refused) && !lobbyOpen();
    var d = document.getElementById('vcDock');
    if (!show) { if (d) d.remove(); lastDock = ''; return; }
    if (!d) { d = document.createElement('div'); d.id = 'vcDock'; d.className = 'vc-dock'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Talking'); document.body.appendChild(d); lastDock = ''; d.innerHTML = dockHTML(); placeBox(d, DOCK_KEY, true); dragBox(d, DOCK_KEY, '.vc-grip'); }
    var h = dockHTML();
    if (h !== lastDock) { lastDock = h; d.innerHTML = h; moveBox(d, d.offsetLeft, d.offsetTop); }
  }
  function removeDock() { var d = document.getElementById('vcDock'); if (d) d.remove(); var b = document.getElementById('vcBubbles'); if (b) b.remove(); lastDock = ''; }
  function renderBubbles() {
    var want = [];
    if (st.inCall) {
      if (st.cam && local.video) want.push({ id: 'me', stream: null, track: local.video, label: 'You', mirror: true });
      others().forEach(function (s) { var p = peers[s]; if (p.ok && p.vstream && p.info && p.info.cam) want.push({ id: s, stream: p.vstream, label: name(s) }); });
    }
    var box = document.getElementById('vcBubbles');
    if (!want.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'vcBubbles'; box.className = 'vc-bubbles'; box.setAttribute('aria-label', 'Video of the players (drag to move)');
      document.body.appendChild(box); placeBox(box, POS_KEY); dragBox(box, POS_KEY);
    }
    var keep = {};
    want.forEach(function (w) {
      keep[w.id] = 1;
      var b = document.getElementById('vcBub' + w.id);
      if (!b) {
        b = document.createElement('div'); b.id = 'vcBub' + w.id; b.className = 'vc-bub' + (w.mirror ? ' vc-mirror' : ''); b.setAttribute('data-vc-ring', w.id);
        b.innerHTML = '<video autoplay playsinline muted></video><span class="vc-nm"></span>';
        box.appendChild(b);
      }
      b.querySelector('.vc-nm').textContent = w.label;
      var v = b.querySelector('video');
      var s = w.stream || (v.srcObject && v.srcObject.getVideoTracks()[0] === w.track ? v.srcObject : new MediaStream([w.track]));
      if (v.srcObject !== s) { v.srcObject = s; var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
    });
    Array.prototype.slice.call(box.children).forEach(function (b) { if (!keep[b.id.slice(5)]) b.remove(); });
  }
  // Where the floating things go. Bubbles: the top-left corner of the picture, under the top bar. The control: the
  // top-right corner under the top bar (the cubes and the action buttons sit lower down). Both can be dragged (the
  // control by its ⠿ grip) and each device remembers where.
  function topBar() { var top = document.querySelector('#game.on #gTop') || document.querySelector('#game #gTop'); var r = top && top.getBoundingClientRect(); return (r && r.bottom > 0 && r.bottom < innerHeight / 2 ? r.bottom : 64) + 8; }
  function placeBox(box, key, right) {
    var pos = null; try { pos = JSON.parse(lsGet(key)); } catch (e) {}
    if (pos && typeof pos.x === 'number') moveBox(box, pos.x * innerWidth, pos.y * innerHeight);
    else moveBox(box, right ? innerWidth - (box.offsetWidth || 200) - 8 : 8, topBar());
  }
  function moveBox(box, x, y) {
    var w = box.offsetWidth || 90, h = box.offsetHeight || 110;
    x = Math.max(4, Math.min(innerWidth - w - 4, x)); y = Math.max(4, Math.min(innerHeight - h - 4, y));
    box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto';
  }
  function dragBox(box, key, grip) {
    var d = null;
    box.addEventListener('pointerdown', function (e) {
      if (grip && !(e.target.closest && e.target.closest(grip))) return;
      d = { x: e.clientX - box.offsetLeft, y: e.clientY - box.offsetTop, id: e.pointerId }; try { box.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); e.stopPropagation();
    });
    box.addEventListener('pointermove', function (e) { if (d && e.pointerId === d.id) moveBox(box, e.clientX - d.x, e.clientY - d.y); });
    var end = function (e) { if (!d || e.pointerId !== d.id) return; d = null; lsSet(key, JSON.stringify({ x: box.offsetLeft / innerWidth, y: box.offsetTop / innerHeight })); };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }
  window.addEventListener('resize', function () { ['vcBubbles', 'vcDock'].forEach(function (id) { var b = document.getElementById(id); if (b) moveBox(b, b.offsetLeft, b.offsetTop); }); });
  // ---------------------------------------------------------------- taps
  if (typeof ACT !== 'undefined') {
    ACT.vcAsk = function () { st.asking = true; refreshUI(true); };
    ACT.vcNotNow = function () { st.asking = false; refreshUI(true); };
    ACT.vcAllowOff = function () { setAllowed(false); };
    ACT.vcTalk = function (el) { st.refused = false; talk(!!(el && el.dataset && el.dataset.arg === 'cam')); };
    ACT.vcAgain = function () { talk(st.cam); };
    ACT.vcForget = function () { st.again = false; st.cam = false; lsSet(CALL_KEY, null); refreshUI(); };
    ACT.vcMic = function () { if (local.audio) setMic(!st.micOff); };
    ACT.vcSpk = function () { setSpeaker(!st.spkOff); };
    ACT.vcCam = function () { if (st.inCall) setCam(!st.cam); };
    ACT.vcHang = function () { hangUp(false); };
    ACT.vcDismiss = function () { st.refused = false; refreshUI(); };
    ACT.vcHear = function () { st.needTap = false; ensureCtx(); others().forEach(function (s) { var a = peers[s].audio; if (a) playAudio(a); }); refreshUI(); };
  }

  // ---------------------------------------------------------------- testing (?onlinetest=1): console helpers
  if (TEST || window.TATA_VOICE_DEBUG) window.TataVoice = {
    st: function () { return JSON.parse(JSON.stringify(st)); },
    peers: function () {
      var o = {}; others().forEach(function (s) { var p = peers[s]; o[s] = { ice: p.pc && p.pc.iceConnectionState, sig: p.pc && p.pc.signalingState, ok: !!p.ok, failed: !!p.failed, info: p.info, stats: p.stats, audioEl: !!p.audio, playing: !!(p.audio && !p.audio.paused), video: !!p.vstream }; });
      return o;
    },
    block: function (on) { block = !!on; return block; },
    decline: function (on) { declineTest = !!on; return declineTest; },
    allow: function (on) { setAllowed(on !== false); },
    talk: function (cam) { talk(!!cam); }, hang: function () { hangUp(false); },
    mic: function (off) { setMic(!!off); }, cam: function (on) { setCam(!!on); }, spk: function (off) { setSpeaker(!!off); },
    sid: function () { return sess && sess.sid(); }, tree: function () { return tree; }, ducked: function () { return ducked; }
  };

  return { room: room, leaveRoom: leaveRoom, seatGone: seatGone, lobbyHTML: lobbyHTML, parentHTML: parentHTML, allowed: allowed,
    talking: function () { return ducked; }, inCall: function () { return st.inCall; }, STUN: STUN };
})();
