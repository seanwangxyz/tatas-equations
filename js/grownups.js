'use strict';
// ======================= GROWN-UPS: PIN, difficulty, reaction time =======================
// House features (not part of official Equations):
//   PIN      The Parent corner (Settings) and the "For Tata" page open with a grown-up PIN. Nothing is built into the code:
//            the first time, a grown-up chooses the PIN. Only a salted SHA-256 hash is kept, in the save (S.pin), so it
//            travels with the signed-in account's cloud save to the other devices. Unlocked for 15 minutes.
//            Forgot it: hold "Forgot the PIN?" for 10 seconds; the PIN is cleared and a new one can be chosen.
//   LEVEL    How cleverly the creatures play the cubes: S.set.aiLevel = 'gentlest' | 'gentle' | 'normal' | 'tougher'.
//            It adjusts each creature's own skill (AI.skill) a step; 'tougher' is capped so it never gets out of reach.
//   PACE     Creature reaction time in a race to call: Auto (calibrated to his own speed, js/pace.js) or a fixed number of
//            seconds, give or take 0.75 s (S.set.paceMode / S.set.paceSec).
var Grown = (function () {
  var UNLOCK_MS = 15 * 60 * 1000, unlockedUntil = 0, tries = 0, waitUntil = 0, mode = null, first = '';
  function now() { return Date.now(); }
  function pinSet() { return !!(S.pin && S.pin.h && S.pin.s); }
  function unlocked() { return now() < unlockedUntil; }
  function lock() { unlockedUntil = 0; }

  // ---- SHA-256 (crypto.subtle where it exists; a small fallback for plain-http pages) ----
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function sha256(text) {
    try { if (window.crypto && crypto.subtle && window.TextEncoder) return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(hex); } catch (e) {}
    return Promise.resolve(sha256js(text));
  }
  function sha256js(s) {
    function r(n, x) { return (x >>> n) | (x << (32 - n)); }
    var K = [], H = [], i, j, P = 2;
    for (i = 0; i < 64;) { var ok = true; for (j = 2; j * j <= P; j++) if (P % j === 0) { ok = false; break; } if (ok) { if (i < 8) H[i] = (Math.pow(P, 1 / 2) * 4294967296) | 0; K[i++] = (Math.pow(P, 1 / 3) * 4294967296) | 0; } P++; }
    var b = unescape(encodeURIComponent(s)), w = [], L = b.length * 8;
    for (i = 0; i < b.length; i++) w[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
    w[L >> 5] |= 0x80 << (24 - L % 32); w[(((L + 64) >> 9) << 4) + 15] = L;
    for (j = 0; j < w.length; j += 16) {
      var a = H.slice(0), W = [];
      for (i = 0; i < 64; i++) {
        W[i] = i < 16 ? w[j + i] | 0 : (r(17, W[i - 2]) ^ r(19, W[i - 2]) ^ (W[i - 2] >>> 10)) + W[i - 7] + (r(7, W[i - 15]) ^ r(18, W[i - 15]) ^ (W[i - 15] >>> 3)) + W[i - 16] | 0;
        var t1 = a[7] + (r(6, a[4]) ^ r(11, a[4]) ^ r(25, a[4])) + ((a[4] & a[5]) ^ (~a[4] & a[6])) + K[i] + W[i] | 0;
        var t2 = (r(2, a[0]) ^ r(13, a[0]) ^ r(22, a[0])) + ((a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2])) | 0;
        a = [t1 + t2 | 0].concat(a.slice(0, 7)); a[4] = a[4] + t1 | 0;
      }
      for (i = 0; i < 8; i++) H[i] = H[i] + a[i] | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  // ---- the PIN pad (shown in place of what it guards) ----
  function padHTML(where) {
    var setting = !pinSet() || mode === 'change';
    var title = setting ? (first ? 'Type the new PIN again' : (mode === 'change' ? 'Choose a new grown-up PIN' : 'Choose a grown-up PIN')) : 'Grown-ups only';
    var note = setting ? (first ? 'To make sure it is right.' : '4 to 12 digits. Both grown-ups can use it on every device signed in to this account.') : 'Type the grown-up PIN.';
    var waitS = Math.ceil((waitUntil - now()) / 1000);
    return '<div class="gu-pad" data-where="' + where + '"><h3>' + ico('lock') + ' ' + title + '</h3><p>' + note + '</p>' +
      '<div class="row"><input id="guPin" class="gu-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off" aria-label="PIN">' +
      '<button class="btn green" data-act="guPinOk">' + (setting ? 'Save' : 'Open') + '</button></div>' +
      '<p class="gu-msg" id="guMsg" role="status">' + (waitS > 0 ? 'Too many tries: wait ' + waitS + ' s.' : '') + '</p>' +
      (setting ? (mode === 'change' ? '<button class="btn small" data-act="guCancel">Cancel</button>' : '') :
        '<button class="btn small gu-forgot" id="guForgot" type="button"><span class="gu-fill"></span><span>Forgot the PIN? Hold for 10 seconds</span></button>') + '</div>';
  }
  function msg(t) { var m = document.getElementById('guMsg'); if (m) m.textContent = t; }
  function refresh() { if (current === 'parent' && window.Parent && Parent.rerender) Parent.rerender(); else if (typeof renderSettings === 'function') renderSettings(); }
  function submit() {
    var el = document.getElementById('guPin'), v = el ? el.value.replace(/\D/g, '') : '';
    if (now() < waitUntil) { msg('Too many tries: wait ' + Math.ceil((waitUntil - now()) / 1000) + ' s.'); return; }
    if (!pinSet() || mode === 'change') {
      if (v.length < 4) { msg('Use at least 4 digits.'); return; }
      if (!first) { first = v; refresh(); setTimeout(focusPin, 30); return; }
      if (v !== first) { first = ''; msg('Those did not match. Start again.'); setTimeout(function () { refresh(); setTimeout(focusPin, 30); }, 900); return; }
      var salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sha256(salt + ':' + v).then(function (h) { S.pin = { s: salt, h: h, at: new Date().toISOString().slice(0, 10) }; persist(); first = ''; mode = null; unlockedUntil = now() + UNLOCK_MS; Snd.chime(); refresh(); });
      return;
    }
    sha256(S.pin.s + ':' + v).then(function (h) {
      if (h === S.pin.h) { tries = 0; unlockedUntil = now() + UNLOCK_MS; Snd.chime(); refresh(); }
      else { tries++; Snd.boop(); if (tries >= 5) { waitUntil = now() + 30000; tries = 0; } if (el) el.value = ''; msg(now() < waitUntil ? 'Too many tries: wait 30 s.' : 'Not that one. Try again.'); }
    });
  }
  function focusPin() { var el = document.getElementById('guPin'); if (el) { el.focus(); el.onkeydown = function (e) { if (e.key === 'Enter') submit(); }; } }
  // hold-to-reset (a forgotten PIN)
  var holdT = null;
  document.addEventListener('pointerdown', function (e) { var b = e.target && e.target.closest && e.target.closest('#guForgot'); if (!b || holdT) return; e.preventDefault(); b.classList.add('holding'); holdT = setTimeout(function () { holdT = null; S.pin = null; persist(); first = ''; mode = null; Snd.click(); refresh(); setTimeout(focusPin, 30); }, 10000); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (!holdT) return; if (ev === 'pointerleave' && !(e.target && e.target.id === 'guForgot')) return; clearTimeout(holdT); holdT = null; var b = document.getElementById('guForgot'); if (b) b.classList.remove('holding'); }, true); });

  // ---- difficulty: one step on each creature's own skill ----
  var LEVELS = [['gentlest', 'Gentlest'], ['gentle', 'Gentle'], ['normal', 'Normal'], ['tougher', 'Tougher']];
  function level() { var v = S.set && S.set.aiLevel; return LEVELS.some(function (l) { return l[0] === v; }) ? v : 'normal'; }
  function adjust(s) {
    var lv = level(); if (lv === 'normal' || !s) return s;
    var c = Object.assign({}, s), cl = function (x, lo, hi) { return Math.max(lo, Math.min(hi, x)); };
    if (lv === 'tougher') {   // a step up, never out of reach: sees a little more, careless a little less
      if (typeof c.seeNow === 'number') c.seeNow = cl(c.seeNow * 1.2, 0, 1);
      if (typeof c.seeImp === 'number' && c.callsImpossible !== false) c.seeImp = cl(Math.max(c.seeImp, 0.3) * 1.2, 0, 1);
      if (typeof c.smart === 'number') c.smart = cl(c.smart + 0.1, 0, 1);
      if (typeof c.trap === 'number') c.trap = cl(c.trap + 0.15, 0, 1);
      return c;
    }
    var k = lv === 'gentle' ? 0.7 : 0.45;
    if (typeof c.seeNow === 'number') c.seeNow *= k;
    if (typeof c.seeImp === 'number') c.seeImp *= k;
    if (typeof c.smart === 'number') c.smart = cl(c.smart * (lv === 'gentle' ? 0.8 : 0.6), 0.3, 1);
    if (typeof c.trap === 'number') c.trap = lv === 'gentle' ? c.trap * 0.5 : 0;
    if (typeof c.goalMax === 'number') c.goalMax = Math.max(9, Math.round(c.goalMax * (lv === 'gentle' ? 0.75 : 0.5)));
    if (typeof c.goalCubes === 'number' && lv === 'gentlest') c.goalCubes = Math.max(1, c.goalCubes - 1);
    if (typeof c.maxDigits === 'number' && lv === 'gentlest') c.maxDigits = Math.max(2, c.maxDigits - 1);
    return c;
  }
  if (window.AI && AI.skill && !AI.skill._grown) { var base = AI.skill; AI.skill = function (o) { return adjust(base(o)); }; AI.skill._grown = true; }

  // ---- the Parent corner panel (difficulty, reaction time, his record, PIN) ----
  function recordHTML() {
    var rows = OPPONENTS.map(function (o, i) { var r = S.rivals && S.rivals[o.id]; return r && r.n ? { o: o, i: i, r: r } : null; }).filter(Boolean);
    if (!rows.length) return '<p class="gu-note">No matches against creatures yet.</p>';
    return '<table class="gu-rec"><thead><tr><th>Creature</th><th>Won</th><th>Lost</th><th>Last 5</th><th></th></tr></thead><tbody>' + rows.map(function (x) {
      var last = (x.r.r || []).map(function (q) { return q[0] === 'w' ? 'W' : q[0] === 'l' ? 'L' : 'D'; }).join(' ');
      var w5 = (x.r.r || []).filter(function (q) { return q[0] === 'w'; }).length, l5 = (x.r.r || []).filter(function (q) { return q[0] === 'l'; }).length;
      var hint = (x.r.r || []).length >= 4 && w5 >= 4 ? 'easy for him now' : (x.r.r || []).length >= 4 && l5 >= 4 ? 'hard for him now' : '';
      return '<tr><td>' + esc(x.o.name) + '</td><td>' + (x.r.w || 0) + '</td><td>' + (x.r.l || 0) + '</td><td>' + last + '</td><td class="gu-hint">' + hint + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function panelHTML() {
    var lv = level(), pm = S.set.paceMode === 'manual' ? 'manual' : 'auto', sec = +S.set.paceSec || 5;
    return '<div class="gu-panel">' +
      '<div class="setrow" style="display:block"><label>How hard the creatures play<br><small style="font-weight:600">How cleverly they move cubes, set Goals and spot Now! and Impossible! Normal is how each creature is built. Tougher is one step up and never out of reach.</small></label>' +
      '<div class="seg" style="margin-top:6px">' + LEVELS.map(function (l) { return '<button class="' + (lv === l[0] ? 'on' : '') + '" data-act="guLevel" data-arg="' + l[0] + '">' + l[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="setrow" style="display:block"><label>Creature reaction time (three at the table)<br><small style="font-weight:600">How long a creature waits, once it has spotted a Now! or Impossible!, before calling it. Auto follows how quickly ' + esc(S.name) + ' calls, against each creature.</small></label>' +
      '<div class="seg" style="margin-top:6px"><button class="' + (pm === 'auto' ? 'on' : '') + '" data-act="guPace" data-arg="auto">Auto</button><button class="' + (pm === 'manual' ? 'on' : '') + '" data-act="guPace" data-arg="manual">Fixed</button></div>' +
      (pm === 'manual' ? '<div class="row" style="margin-top:8px;gap:10px;align-items:center"><input type="range" id="guSec" min="1" max="15" step="0.5" value="' + sec + '" style="flex:1" aria-label="Seconds"><b id="guSecV">' + sec.toFixed(1) + ' s</b><small>± 0.75 s</small></div>' : '') + '</div>' +
      '<div class="setrow" style="display:block"><label>' + esc(S.name) + '\'s record against each creature<br><small style="font-weight:600">If he wins almost every match, try Tougher; if he keeps losing, try Gentle.</small></label>' + recordHTML() + '</div>' +
      '<div class="setrow"><label>Grown-up PIN<br><small style="font-weight:600">Opens this corner and the For Tata page for 15 minutes.</small></label><button class="btn small" data-act="guChange">Change PIN</button><button class="btn small" data-act="guLock">Lock now</button></div>' +
      '</div>';
  }
  // Settings: the Parent corner group shows the PIN pad until it is unlocked; once open, the panel above goes first
  function guardSettings() {
    var g = document.querySelector('#settings details.group[data-g="parent"]'); if (!g) return;
    var sum = g.querySelector('summary');
    if (!unlocked() || mode === 'change') {
      [].slice.call(g.children).forEach(function (c) { if (c !== sum) c.remove(); });
      g.insertAdjacentHTML('beforeend', padHTML('settings'));
      g.addEventListener('toggle', function () { if (g.open) setTimeout(focusPin, 30); });
    } else if (sum) sum.insertAdjacentHTML('afterend', panelHTML());
  }
  if (typeof renderSettings === 'function' && !renderSettings._grown) {
    var rs = renderSettings;
    window.renderSettings = renderSettings = function () { var r = rs.apply(this, arguments); try { guardSettings(); } catch (e) { console.warn('[grown]', e); } return r; };
    renderSettings._grown = true;
  }

  if (typeof ACT !== 'undefined') {
    ACT.guPinOk = function () { submit(); };
    ACT.guCancel = function () { mode = null; first = ''; refresh(); };
    ACT.guChange = function () { mode = 'change'; first = ''; refresh(); setTimeout(focusPin, 30); };
    ACT.guLock = function () { lock(); Snd.click(); refresh(); };
    ACT.guLevel = function (el) { S.set.aiLevel = el.dataset.arg; persist(); Snd.click(); refresh(); };
    ACT.guPace = function (el) { S.set.paceMode = el.dataset.arg; if (!S.set.paceSec) S.set.paceSec = 5; persist(); Snd.click(); refresh(); };
  }
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'guSec') { S.set.paceSec = +e.target.value; var v = document.getElementById('guSecV'); if (v) v.textContent = (+e.target.value).toFixed(1) + ' s'; } });
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'guSec') persist(); });

  return { unlocked: unlocked, pinSet: pinSet, lock: lock, padHTML: padHTML, focusPin: focusPin, level: level, adjust: adjust, panelHTML: panelHTML, _sha: sha256js };
})();
