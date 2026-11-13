'use strict';
// ======================= ONLINE PLAY: TRANSPORT =======================
// One small interface, two interchangeable back ends (docs/handoff/online.md):
//   Net.available()                 is online play possible here? (config pasted, or ?onlinetest=1)
//   Net.init() -> Promise(uid)      load + sign in (Firebase: anonymous sign-in); uid = this device's id
//   Net.read(path) -> Promise(val)  one-time read
//   Net.write(path, val)            set a value (null removes it)
//   Net.create(path, val)           write only if nothing is there yet -> Promise(true / false = taken)
//   Net.transaction(path, fn)       fn(current) returns the new value, or undefined to give up -> Promise(committed)
//   Net.subscribe(path, cb)         cb(value) now and on every change; returns an unsubscribe function
//   Net.presence(path, me, cb)      mark "I'm here" at path/me (removed when I disconnect); cb({seat: true}) for everyone here
//   Net.stamp()                     a "server time" value for room creation
// Paths look like 'rooms/FROG47/state'. Values are small JSON (the game state travels as one JSON string).
//
// 'firebase': Google Firebase Realtime Database, loaded lazily from Google's CDN only when online play opens.
// 'local'   : for testing on ONE computer: open two tabs with ?onlinetest=1&p=a and ?onlinetest=1&p=b.
//             The "database" lives in this browser's localStorage, and the tabs hear each other through
//             'storage' events. p= gives each tab its own player (own save, own device id).
//             TataOnline.drop(true/false) in a tab pretends its Wi-Fi went off / came back.
var Net = (function () {
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';   // pinned version
  var q = location.search;
  var TEST = /[?&]onlinetest=1(&|$)/.test(q);
  var PROFILE = (q.match(/[?&]p=([a-z0-9]{1,8})(&|$)/) || [])[1] || 'a';
  function kind() { return TEST ? 'local' : (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.databaseURL ? 'firebase' : null); }
  var impl = null;

  // ---------------------------------------------------------------- local (two tabs, one browser)
  function Local() {
    var PFX = 'tataNet:', subs = [], dropped = false, queue = [], pending = {}, uid = null;
    function allKeys() { var out = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(PFX) === 0) out.push(k.slice(PFX.length)); } } catch (e) {} return out; }
    function related(a, b) { return a === b || b.indexOf(a + '/') === 0 || a.indexOf(b + '/') === 0; }
    function put(tree, parts, v) {
      var o = tree;
      for (var i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
      o[parts[parts.length - 1]] = v;
    }
    function dig(tree, parts) { var o = tree; for (var i = 0; i < parts.length; i++) { if (!o || typeof o !== 'object' || !(parts[i] in o)) return null; o = o[parts[i]]; } return o === undefined ? null : o; }
    function readNow(path) {
      var ks = allKeys().filter(function (k) { return related(k, path); }).sort(function (a, b) { return a.length - b.length; });
      if (!ks.length) return null;
      var tree = {};
      ks.forEach(function (k) { var v; try { v = JSON.parse(localStorage.getItem(PFX + k)); } catch (e) { return; } put(tree, k.split('/'), v); });
      return dig(tree, path.split('/'));
    }
    function writeNow(path, val) {
      allKeys().forEach(function (k) { if (k === path || k.indexOf(path + '/') === 0) localStorage.removeItem(PFX + k); });
      if (val !== null && val !== undefined) localStorage.setItem(PFX + path, JSON.stringify(val));
      changed(path);
    }
    // Tell this tab's listeners (other tabs hear it through the 'storage' event).
    function changed(path) {
      subs.forEach(function (s) {
        if (!related(s.path, path) || pending[s.id]) return;
        pending[s.id] = true;
        setTimeout(function () { delete pending[s.id]; if (!dropped && s.live) s.cb(readNow(s.path)); }, 0);
      });
    }
    window.addEventListener('storage', function (e) {
      if (dropped) return;
      if (e.key === null) { subs.forEach(function (s) { changed(s.path); }); return; }
      if (e.key.indexOf(PFX) === 0) changed(e.key.slice(PFX.length));
    });
    var nextId = 1;
    var api = {
      init: function () {
        if (!uid) { var k = 'tataNet.uid.' + PROFILE; try { uid = localStorage.getItem(k); if (!uid) { uid = 'L' + Math.random().toString(36).slice(2, 12); localStorage.setItem(k, uid); } } catch (e) { uid = 'L' + Math.random().toString(36).slice(2, 12); } }
        return Promise.resolve(uid);
      },
      read: function (path) { return new Promise(function (ok) { setTimeout(function () { ok(readNow(path)); }, 0); }); },
      write: function (path, val) { if (dropped) { queue.push([path, val]); return Promise.resolve(); } writeNow(path, val); return Promise.resolve(); },
      create: function (path, val) { if (dropped) return Promise.reject(new Error('offline')); if (readNow(path) !== null) return Promise.resolve(false); writeNow(path, val); return Promise.resolve(true); },
      transaction: function (path, fn) {
        if (dropped) return Promise.reject(new Error('offline'));
        var next = fn(readNow(path));
        if (next === undefined) return Promise.resolve(false);
        writeNow(path, next); return Promise.resolve(true);
      },
      subscribe: function (path, cb) {
        var s = { id: nextId++, path: path, cb: cb, live: true }; subs.push(s);
        setTimeout(function () { if (s.live && !dropped) cb(readNow(path)); }, 0);
        return function () { s.live = false; subs = subs.filter(function (x) { return x !== s; }); };
      },
      // Heartbeat every 1.5 s; someone counts as here if their beat is under 5 s old.
      presence: function (path, me, cb) {
        var live = true, seen = '';
        function beat() { if (live && !dropped) writeNow(path + '/' + me, Date.now()); }
        function look() {
          if (!live || dropped) return;
          var v = readNow(path) || {}, now = Date.now(), out = {};
          Object.keys(v).forEach(function (k) { if (typeof v[k] === 'number' && now - v[k] < 5000) out[k] = true; });
          var key = JSON.stringify(out); if (key !== seen) { seen = key; cb(out); }
        }
        function bye() { if (live) { try { localStorage.removeItem(PFX + path + '/' + me); } catch (e) {} } }
        beat(); var t1 = setInterval(beat, 1500), t2 = setInterval(look, 1000); setTimeout(look, 50);
        window.addEventListener('pagehide', bye);
        return function () { bye(); live = false; clearInterval(t1); clearInterval(t2); window.removeEventListener('pagehide', bye); };
      },
      stamp: function () { return Date.now(); },
      // Testing: pretend the connection dropped (writes wait, nothing is heard) or came back.
      drop: function (on) {
        dropped = !!on;
        if (!dropped) { var qd = queue; queue = []; qd.forEach(function (w) { writeNow(w[0], w[1]); }); subs.forEach(function (s) { changed(s.path); }); }
        return dropped;
      }
    };
    return api;
  }

  // ---------------------------------------------------------------- Firebase Realtime Database
  function Fire() {
    var db = null, uid = null, ready = null;
    function load(src) {
      return new Promise(function (ok, bad) {
        var s = document.createElement('script'); s.src = SDK + src; s.async = false;
        s.onload = function () { ok(); }; s.onerror = function () { bad(new Error('Could not load ' + src)); };
        document.head.appendChild(s);
      });
    }
    var api = {
      init: function () {
        if (ready) return ready;
        ready = (window.firebase && firebase.database ? Promise.resolve() :
          load('firebase-app-compat.js').then(function () { return Promise.all([load('firebase-auth-compat.js'), load('firebase-database-compat.js')]); }))
          .then(function () {
            if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
            db = firebase.database();
            var auth = firebase.auth();
            if (auth.currentUser) return auth.currentUser;
            return new Promise(function (ok, bad) {
              var off = auth.onAuthStateChanged(function (u) { if (u) { off(); ok(u); } });
              auth.signInAnonymously().catch(function (e) { off(); bad(e); });
            });
          })
          .then(function (u) { uid = u.uid; return uid; })
          .catch(function (e) { ready = null; throw e; });
        return ready;
      },
      read: function (path) { return db.ref(path).once('value').then(function (s) { return s.val(); }); },
      write: function (path, val) { return db.ref(path).set(val === undefined ? null : val); },
      // Create a new room: the security rules refuse to overwrite a room that already exists.
      create: function (path, val) {
        return db.ref(path).set(val).then(function () { return true; }, function (e) { if (e && /permission/i.test(e.code || e.message || '')) return false; throw e; });
      },
      transaction: function (path, fn) {
        return db.ref(path).transaction(function (cur) { return fn(cur); }, null, false).then(function (r) { return !!r.committed; });
      },
      subscribe: function (path, cb) {
        var ref = db.ref(path), h = ref.on('value', function (s) { cb(s.val()); }, function (e) { if (window.console) console.warn('[online] read refused', path, e && e.code); });
        return function () { ref.off('value', h); };
      },
      presence: function (path, me, cb) {
        var conn = db.ref('.info/connected'), mine = db.ref(path + '/' + me), all = db.ref(path);
        var hc = conn.on('value', function (s) { if (s.val() === true) mine.onDisconnect().remove().then(function () { return mine.set(true); }).catch(function () {}); });
        var ha = all.on('value', function (s) { var v = s.val() || {}, out = {}; Object.keys(v).forEach(function (k) { if (v[k]) out[k] = true; }); cb(out); });
        return function () { conn.off('value', hc); all.off('value', ha); mine.onDisconnect().cancel(); mine.remove().catch(function () {}); };
      },
      stamp: function () { return firebase.database.ServerValue.TIMESTAMP; },
      drop: function (on) { if (on) firebase.database().goOffline(); else firebase.database().goOnline(); return !!on; }
    };
    return api;
  }

  function I() { if (!impl) impl = kind() === 'local' ? Local() : Fire(); return impl; }
  return {
    available: function () { return !!kind(); }, kind: kind, test: TEST, profile: PROFILE,
    init: function () { return I().init(); },
    read: function (p) { return I().read(p); }, write: function (p, v) { return I().write(p, v); }, create: function (p, v) { return I().create(p, v); },
    transaction: function (p, f) { return I().transaction(p, f); }, subscribe: function (p, cb) { return I().subscribe(p, cb); },
    presence: function (p, me, cb) { return I().presence(p, me, cb); }, stamp: function () { return I().stamp(); },
    drop: function (on) { return I().drop(on); }
  };
})();

// ACCOUNT (docs/handoff/account.md): before online play signs in anonymously, wait until a signed-in account (Google /
// email) has been restored, so it is never replaced; then play as whoever is signed in now (signed out: anonymous).
(function () {
  var init = Net.init;
  Net.init = function () {
    var wait = window.Account && Account.authReady ? Account.authReady() : Promise.resolve();
    return wait.then(init).then(function (uid) {
      if (Net.kind() !== 'firebase' || !window.firebase || !firebase.apps.length) return uid;
      var a = firebase.auth();
      return a.currentUser ? a.currentUser.uid : a.signInAnonymously().then(function (c) { return c.user.uid; });
    });
  };
})();
// /ACCOUNT
