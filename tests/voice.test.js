// Tests for the talking signalling (VoiceCore in js/voice.js, between /*CORE-START*/ and /*CORE-END*/).
// Run with:  node tests/voice.test.js
// The real RTCPeerConnection is replaced by a small pretend one that follows the same signalling-state rules
// (stable / have-local-offer / have-remote-offer, rollback, candidates need a remote description), and the
// Firebase room by a shared tree whose changes reach each "device" later (in a controllable order).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'voice.js'), 'utf8');
const m = src.match(/\/\*CORE-START\*\/([\s\S]*?)\/\*CORE-END\*\//);
if (!m) { console.error('Core markers not found'); process.exit(1); }
const VC = new Function(m[1] + '\nreturn VoiceCore;')();

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
const tick = () => new Promise(r => setImmediate(r));
async function settle(k = 60) { for (let i = 0; i < k; i++) await tick(); }
// A note as it travels: JSON on the wire, read back with the real parser.
const W = x => VC.parseMsg(JSON.stringify(Object.assign({ s: 'aaaa1111', r: 'bbbb2222' }, x)));

// ---------------------------------------------------------------- a pretend peer connection
let PCID = 0;
class FakePC {
  constructor(name) {
    this.id = ++PCID; this.name = name; this.gen = 0;
    this.signalingState = 'stable'; this.localDescription = null; this.remoteDescription = null;
    this.iceConnectionState = 'new'; this.added = []; this.refused = 0; this.closedNow = false; this.transceivers = 0;
    this.onnegotiationneeded = null; this.onicecandidate = null; this.oniceconnectionstatechange = null;
    this.stableLocal = null; this.stableRemote = null; this.blockCands = false;
  }
  ufragOf(sdp) { return (sdp.match(/u=([a-z0-9]+)/) || [])[1]; }
  addTransceiver() { this.transceivers++; setImmediate(() => { if (!this.closedNow && this.onnegotiationneeded) this.onnegotiationneeded(); }); }
  async createOffer(opts) { await tick(); if (this.closedNow) throw new Error('closed'); return { type: 'offer', sdp: 'offer from ' + this.name + ' u=' + this.name.replace(/\W/g, '') + 'x' + this.id + 'g' + (++this.gen) + (opts && opts.iceRestart ? ' restart' : '') }; }
  async createAnswer() { await tick(); if (this.signalingState !== 'have-remote-offer') throw new Error('InvalidStateError: no offer'); return { type: 'answer', sdp: 'answer from ' + this.name + ' u=' + this.name.replace(/\W/g, '') + 'x' + this.id + 'g' + (++this.gen) }; }
  async setLocalDescription(d) {
    await tick(); if (this.closedNow) throw new Error('closed');
    if (d.type === 'rollback') {
      if (this.signalingState !== 'have-local-offer') throw new Error('InvalidStateError: rollback in ' + this.signalingState);
      this.signalingState = 'stable'; this.localDescription = this.stableLocal; return;
    }
    if (d.type === 'offer') { if (this.signalingState !== 'stable' && this.signalingState !== 'have-local-offer') throw new Error('InvalidStateError: offer in ' + this.signalingState); this.signalingState = 'have-local-offer'; this.localDescription = d; }
    else if (d.type === 'answer') { if (this.signalingState !== 'have-remote-offer') throw new Error('InvalidStateError: answer in ' + this.signalingState); this.signalingState = 'stable'; this.localDescription = d; this.stableLocal = d; this.stableRemote = this.remoteDescription; }
    const u = this.ufragOf(d.sdp);
    setImmediate(() => { // gather two candidates, then "done"
      if (this.closedNow || !this.onicecandidate) return;
      this.onicecandidate({ candidate: { candidate: 'candidate:1 ' + u + ' host', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: u } });
      this.onicecandidate({ candidate: { candidate: 'candidate:2 ' + u + ' srflx', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: u } });
      this.onicecandidate({ candidate: null });
    });
    this.check();
  }
  async setRemoteDescription(d) {
    await tick(); if (this.closedNow) throw new Error('closed');
    if (d.type === 'offer') { if (this.signalingState !== 'stable') throw new Error('InvalidStateError: remote offer in ' + this.signalingState); this.signalingState = 'have-remote-offer'; this.remoteDescription = d; }
    else { if (this.signalingState !== 'have-local-offer') throw new Error('InvalidStateError: remote answer in ' + this.signalingState); this.signalingState = 'stable'; this.remoteDescription = d; this.stableLocal = this.localDescription; this.stableRemote = d; }
    this.check();
  }
  async addIceCandidate(c) {
    await tick();
    if (!this.remoteDescription) throw new Error('InvalidStateError: no remote description');
    if (c.usernameFragment && c.usernameFragment !== this.ufragOf(this.remoteDescription.sdp)) { this.refused++; throw new Error('OperationError: unknown ufrag'); }
    this.added.push(c.candidate); this.check();
  }
  check() {
    const was = this.iceConnectionState;
    if (this.signalingState === 'stable' && this.localDescription && this.remoteDescription && this.added.some(c => c.indexOf(this.ufragOf(this.remoteDescription.sdp)) >= 0)) this.iceConnectionState = 'connected';
    if (was !== this.iceConnectionState && this.oniceconnectionstatechange) this.oniceconnectionstatechange();
  }
  close() { this.closedNow = true; this.iceConnectionState = 'closed'; this.signalingState = 'closed'; }
}

// ---------------------------------------------------------------- a pretend room (the rtc subtree)
function Room() {
  const tree = {}, devices = [];
  let hold = false, held = [];
  function put(p, v) {
    const parts = p.split('/'); let o = tree;
    for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
    if (v === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = v;
  }
  const room = {
    tree, devices, writes: 0, refuse: false,
    write(p, v) { if (room.refuse) return Promise.reject(new Error('PERMISSION_DENIED')); room.writes++; put(p, v); room.notify(); return Promise.resolve(); },
    notify() { if (hold) { held.push(1); return; } setImmediate(() => devices.forEach(d => d.deliver())); },
    hold(v) { hold = v; if (!v && held.length) { held = []; room.notify(); } },
    snapshot() { return JSON.parse(JSON.stringify(tree)); }
  };
  return room;
}
function Device(room, seat, name) {
  const dev = { seat: String(seat), name, pcs: {}, opened: [], closedLinks: [], info: {}, lost: false };
  dev.session = VC.Session({
    me: seat,
    write: (p, v) => room.write(p, v),
    makePc: (slot, starts) => { const pc = new FakePC(name + '>' + slot); dev.pcs[slot] = pc; if (starts) { pc.addTransceiver('audio'); pc.addTransceiver('video'); } return pc; },
    onPeer: (slot, link) => { if (link) dev.opened.push(slot); else dev.closedLinks.push(slot); },
    onInfo: (slot, f) => { dev.info[slot] = f; }
  });
  dev.deliver = () => { if (!dev.lost) dev.session.onTree(room.snapshot()); };
  dev.start = () => dev.session.start();
  dev.connectedTo = slot => { const L = dev.session.links()[slot]; return !!L && L.peer.pc.iceConnectionState === 'connected'; };
  room.devices.push(dev);
  return dev;
}

(async function main() {
  // ---------------- parsing
  ok('hi parses', VC.parseHi(JSON.stringify({ s: 'abcd1234', cam: true })).cam === true);
  ok('hi mic defaults on', VC.parseHi(JSON.stringify({ s: 'abcd1234' })).mic === true);
  ok('hi bad sid refused', VC.parseHi(JSON.stringify({ s: 'AB<>' })) === null);
  ok('hi too long refused', VC.parseHi('x'.repeat(201)) === null);
  ok('hi garbage refused', VC.parseHi('{nope') === null && VC.parseHi(42) === null);
  ok('desc parses', VC.parseMsg(JSON.stringify({ t: 'desc', s: 'aaaa1111', r: 'bbbb2222', d: { type: 'offer', sdp: 'v=0' } })).d.type === 'offer');
  ok('desc wrong type refused', VC.parseMsg(JSON.stringify({ t: 'desc', s: 'aaaa1111', r: 'bbbb2222', d: { type: 'pranswer', sdp: 'v=0' } })) === null);
  ok('desc huge sdp refused', VC.parseMsg(JSON.stringify({ t: 'desc', s: 'aaaa1111', r: 'bbbb2222', d: { type: 'offer', sdp: 'x'.repeat(VC.MAX_SDP + 1) } })) === null);
  ok('cand parses', VC.parseMsg(JSON.stringify({ t: 'cand', s: 'aaaa1111', r: 'bbbb2222', c: { c: 'candidate:1', m: '0', i: 0 } })).c.sdpMLineIndex === 0);
  ok('end-of-candidates parses', VC.parseMsg(JSON.stringify({ t: 'cand', s: 'aaaa1111', r: 'bbbb2222', c: null })).c === null);
  ok('unknown kind refused', VC.parseMsg(JSON.stringify({ t: 'bye', s: 'aaaa1111', r: 'bbbb2222' })) === null);
  ok('roles: host starts, guest polite', VC.starts('0', '1') && !VC.starts('1', '0') && VC.polite('2', '1') && !VC.polite('0', '2'));

  // ---------------- two devices connect
  {
    const room = Room(), A = Device(room, 0, 'A'), B = Device(room, 1, 'B');
    await A.start(); await B.start(); await settle();
    ok('2p: A connected to B', A.connectedTo('1'));
    ok('2p: B connected to A', B.connectedTo('0'));
    ok('2p: only the host offered', A.pcs['1'].transceivers === 2 && B.pcs['0'].transceivers === 0);
    ok('2p: one link each', Object.keys(A.session.links()).length === 1 && Object.keys(B.session.links()).length === 1);
    await A.session.setFlags({ cam: true, mic: false }); await settle();
    ok('2p: flags reach the other side', B.info['0'] && B.info['0'].cam === true && B.info['0'].mic === false);
    ok('2p: flags did not restart the link', B.connectedTo('0') && B.opened.length === 1);
    await B.session.stop(); await settle();
    ok('2p: hang up removes my notes', !room.tree['1']);
    ok('2p: the other side closes the link', !A.session.links()['1'] && A.closedLinks.indexOf('1') >= 0);
    ok('2p: pc closed', A.pcs['1'].closedNow && B.pcs['0'].closedNow);
  }

  // ---------------- glare: both sides offer at the same moment (Peer level)
  {
    const box = { a: [], b: [] };
    const pa = new FakePC('ga'), pb = new FakePC('gb');
    const A = VC.Peer({ pc: pa, polite: false, send: msg => box.b.push(msg) });
    const B = VC.Peer({ pc: pb, polite: true, send: msg => box.a.push(msg) });
    pa.addTransceiver(); pb.addTransceiver(); // both want to negotiate
    for (let round = 0; round < 30; round++) {
      await settle(4);
      const qa = box.a.splice(0), qb = box.b.splice(0);
      qa.forEach(x => A.handle(W(x))); qb.forEach(x => B.handle(W(x)));
    }
    await settle();
    ok('glare: both connected', pa.iceConnectionState === 'connected' && pb.iceConnectionState === 'connected', [pa.signalingState, pb.signalingState]);
    ok('glare: both stable', pa.signalingState === 'stable' && pb.signalingState === 'stable');
    ok('glare: the impolite offer won', pb.remoteDescription && /offer from ga/.test(pb.remoteDescription.sdp));
  }

  // ---------------- glare with reversed delivery order (the polite side's offer lands first)
  {
    const box = { a: [], b: [] };
    const pa = new FakePC('ra'), pb = new FakePC('rb');
    const A = VC.Peer({ pc: pa, polite: false, send: msg => box.b.push(msg) });
    const B = VC.Peer({ pc: pb, polite: true, send: msg => box.a.push(msg) });
    pb.addTransceiver(); await settle(6); pa.addTransceiver();
    for (let round = 0; round < 30; round++) {
      await settle(3);
      const qb = box.b.splice(0), qa = box.a.splice(0);
      qb.forEach(x => B.handle(W(x))); qa.forEach(x => A.handle(W(x)));
    }
    await settle();
    ok('glare 2: both connected', pa.iceConnectionState === 'connected' && pb.iceConnectionState === 'connected', [pa.signalingState, pb.signalingState]);
  }

  // ---------------- a late joiner (third player arrives while two are talking)
  {
    const room = Room(), A = Device(room, 0, 'A'), B = Device(room, 1, 'B');
    await A.start(); await B.start(); await settle();
    const abPc = A.pcs['1'];
    const C = Device(room, 2, 'C');
    await C.start(); await settle(120);
    ok('late: A-C connected', A.connectedTo('2') && C.connectedTo('0'));
    ok('late: B-C connected', B.connectedTo('2') && C.connectedTo('1'));
    ok('late: A-B untouched', A.session.links()['1'].peer.pc === abPc && A.connectedTo('1') && B.connectedTo('0'));
    ok('late: C polite on both links', C.pcs['0'].transceivers === 0 && C.pcs['1'].transceivers === 0);
    ok('late: B starts its link to C', B.pcs['2'].transceivers === 2);
    ok('late: two links each', [A, B, C].every(d => Object.keys(d.session.links()).length === 2));
  }

  // ---------------- leave and rejoin (a reload = a new session id; old notes must be ignored)
  {
    const room = Room(), A = Device(room, 0, 'A'), B = Device(room, 1, 'B');
    await A.start(); await B.start(); await settle();
    const oldSid = B.session.sid(), oldPc = A.pcs['1'];
    // B's page reloads: the old device vanishes without saying goodbye; its notes are still in the room for a moment.
    B.lost = true; room.devices.splice(room.devices.indexOf(B), 1);
    const B2 = Device(room, 1, 'B2');
    room.hold(true);
    await B2.start(); // writes null + a new hi, but A hears it all at once
    room.hold(false);
    await settle(120);
    ok('rejoin: new session id', B2.session.sid() !== oldSid);
    ok('rejoin: A closed the old link', oldPc.closedNow);
    ok('rejoin: connected again', A.connectedTo('1') && B2.connectedTo('0'));
    ok('rejoin: A noticed a leave and a join', A.closedLinks.indexOf('1') >= 0 && A.opened.filter(x => x === '1').length === 2);
    // A stale note from B's old session reaches A: ignored.
    room.tree['1']['0']['9000'] = JSON.stringify({ t: 'desc', s: oldSid, r: A.session.sid(), d: { type: 'offer', sdp: 'stale u=zz' } });
    room.notify(); await settle();
    ok('rejoin: stale note ignored', A.connectedTo('1') && A.pcs['1'].signalingState === 'stable');
    // A note meant for A's older session: ignored too.
    room.tree['1']['0']['9001'] = JSON.stringify({ t: 'desc', s: B2.session.sid(), r: 'olderses1', d: { type: 'offer', sdp: 'old target u=zz' } });
    room.notify(); await settle();
    ok('rejoin: note for my old session ignored', A.connectedTo('1') && A.pcs['1'].signalingState === 'stable');
    // Hang up and come back in the same page (a new session too).
    await B2.session.stop(); await settle();
    ok('rejoin: hung up', !A.session.links()['1']);
    await B2.session.start(); await settle(120);
    ok('rejoin: back after hanging up', A.connectedTo('1') && B2.connectedTo('0'));
  }

  // ---------------- candidate ordering
  {
    // Candidates that arrive before the offer wait for it (Peer level).
    const pa = new FakePC('ca'), pb = new FakePC('cb');
    const toB = [], toA = [];
    const A = VC.Peer({ pc: pa, polite: false, send: msg => toB.push(msg) });
    const B = VC.Peer({ pc: pb, polite: true, send: msg => toA.push(msg) });
    pa.addTransceiver(); await settle(20);
    const desc = toB.filter(x => x.t === 'desc'), cands = toB.filter(x => x.t === 'cand');
    ok('order: offer and candidates produced', desc.length === 1 && cands.length === 3);
    cands.forEach(x => B.handle(W(x))); // candidates first…
    await settle(10);
    ok('order: early candidates kept, not refused', B.pendingCount() === 2 && pb.refused === 0 && pb.added.length === 0);
    B.handle(W(desc[0])); // …then the offer
    await settle(20);
    ok('order: early candidates applied after the offer', pb.added.length === 2 && B.pendingCount() === 0);
    toA.splice(0).forEach(x => A.handle(W(x))); await settle(20);
    ok('order: connected', pa.iceConnectionState === 'connected' && pb.iceConnectionState === 'connected');
  }
  {
    // Through the mailbox: numbered notes written out of order are read in number order.
    const mb = VC.Mailbox('1');
    const hi = JSON.stringify({ s: 'aaaa1111' });
    const n = (t, k) => JSON.stringify(Object.assign({ s: 'aaaa1111', r: 'bbbb2222' }, t, { k }));
    const tree = { 0: { hi, 1: { 3: n({ t: 'cand', c: { c: 'c2' } }), 1: n({ t: 'desc', d: { type: 'offer', sdp: 'o' } }), 2: n({ t: 'cand', c: { c: 'c1' } }) } } };
    const ev = mb.read(tree, 'bbbb2222');
    ok('mailbox: join seen', ev.joins.length === 1 && ev.joins[0].slot === '0');
    ok('mailbox: notes in number order', ev.msgs['0'] && ev.msgs['0'].map(x => x.t === 'desc' ? 'd' : x.c.candidate).join() === 'd,c1,c2', ev.msgs['0']);
    const again = mb.read(tree, 'bbbb2222');
    ok('mailbox: nothing twice', !again.msgs['0'] && again.joins.length === 0);
    tree[0][1][10] = n({ t: 'cand', c: { c: 'c3' } });
    tree[0][1][4] = n({ t: 'cand', c: { c: 'c-for-someone-else' } }).replace('bbbb2222', 'cccc3333');
    const more = mb.read(tree, 'bbbb2222');
    ok('mailbox: only new notes for my session', more.msgs['0'] && more.msgs['0'].length === 1 && more.msgs['0'][0].c.candidate === 'c3');
    tree[0].hi = JSON.stringify({ s: 'dddd4444' });
    const re = mb.read(tree, 'bbbb2222');
    ok('mailbox: a new session = leave + join, old notes dropped', re.leaves[0] === '0' && re.joins[0].sid === 'dddd4444' && !re.msgs['0']);
    delete tree[0];
    ok('mailbox: hi gone = leave', mb.read(tree, 'bbbb2222').leaves[0] === '0');
    ok('mailbox: my own seat ignored', VC.Mailbox('0').read({ 0: { hi } }, 'x1x1x1x1').joins.length === 0);
    ok('mailbox: junk tree is fine', VC.Mailbox('0').read(null, 'x1x1x1x1').joins.length === 0 && VC.Mailbox('0').read({ 1: 'junk' }, 'x1x1x1x1').joins.length === 0);
  }
  {
    // Candidates from a rolled-back (losing) offer don't break the winner's connection.
    const room = Room(), A = Device(room, 0, 'A'), B = Device(room, 1, 'B');
    await A.start(); await B.start(); await settle();
    // Both renegotiate at the same time (say, both restart ICE).
    A.session.links()['1'].peer.negotiate(true); B.session.links()['0'].peer.negotiate(true);
    await settle(150);
    ok('order: still connected after a renegotiation clash', A.connectedTo('1') && B.connectedTo('0'), [A.pcs['1'].signalingState, B.pcs['0'].signalingState]);
    ok('order: both stable', A.pcs['1'].signalingState === 'stable' && B.pcs['0'].signalingState === 'stable');
  }

  // ---------------- the database refuses (rules not published yet)
  {
    const room = Room(); room.refuse = true;
    const A = Device(room, 0, 'A');
    let refused = false; await A.start().catch(() => { refused = true; });
    ok('rules: refusal reaches the caller', refused);
  }

  // ---------------- caps
  {
    const room = Room(), A = Device(room, 0, 'A'), B = Device(room, 1, 'B');
    await A.start(); await B.start(); await settle();
    const L = A.session.links()['1'];
    const before = room.writes;
    for (let i = 0; i < 100; i++) L.peer.pc.onicecandidate({ candidate: { candidate: 'candidate:x' + i, sdpMid: '0', sdpMLineIndex: 0 } });
    ok('caps: at most ' + VC.MAX_CANDS_PER_LINK + ' candidates per link', room.writes - before <= VC.MAX_CANDS_PER_LINK);
    const keys = Object.keys(room.tree['0']['1']);
    ok('caps: note numbers fit the rules (1-4 digits)', keys.every(k => /^[0-9]{1,4}$/.test(k)));
    ok('caps: hi fits the rules (<= 200)', room.tree['0'].hi.length <= 200);
    ok('caps: every note is a string under 16000', keys.every(k => typeof room.tree['0']['1'][k] === 'string' && room.tree['0']['1'][k].length <= 16000));
  }

  // ---------------- renew (this device lost the database for a while)
  {
    const room = Room(), A = Device(room, 0, 'A'), B = Device(room, 1, 'B'), C = Device(room, 2, 'C');
    await A.start(); await B.start(); await C.start(); await settle(150);
    const s0 = C.session.sid();
    await C.session.renew(); await settle(150);
    ok('renew: new sid', C.session.sid() !== s0);
    ok('renew: everybody reconnected', A.connectedTo('2') && B.connectedTo('2') && C.connectedTo('0') && C.connectedTo('1'));
    ok('renew: A-B kept', A.connectedTo('1') && B.connectedTo('0') && A.opened.filter(x => x === '1').length === 1);
  }

  console.log((fail ? 'FAILED ' : '') + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
