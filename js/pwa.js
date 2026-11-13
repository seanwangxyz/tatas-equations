'use strict';
// ======================= HOME-SCREEN APP (PWA) =======================
// Registers sw.js (offline play), shows "New version ready: tap to update" on the title screen only, the
// install helper (Chrome/Edge button, iPad/iPhone Share -> Add to Home Screen steps), an offline chip, kind
// "this needs the internet" messages, and the Settings rows (PWA.settingsHTML / PWA.parentRowHTML).
// Saves are untouched (localStorage + cloud). Notes: docs/handoff/pwa.md
var PWA = (function () {
  var KEY = 'tataPWA.';
  var ua = navigator.userAgent || '';
  var IOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var mq = function (q) { try { return !!(window.matchMedia && matchMedia(q).matches); } catch (e) { return false; } };
  function standalone() { return navigator.standalone === true || mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || mq('(display-mode: minimal-ui)'); }
  var SW_OK = 'serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
  var reg = null, waiting = null, applying = false, deferred = null, info = null, bornAt = Date.now();

  function get(k) { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } }
  function set(k, v) { try { if (v == null) localStorage.removeItem(KEY + k); else localStorage.setItem(KEY + k, v); } catch (e) {} }
  function on(id) { var el = document.getElementById(id); return !!(el && el.classList.contains('on')); }
  function modalOpen() { return on('modal') || on('builder'); }
  function online() { return navigator.onLine !== false; }
  function cls() {
    var r = document.documentElement.classList;
    r.toggle('pwa-standalone', standalone()); r.toggle('pwa-ios', IOS); r.toggle('pwa-offline', !online());
  }
  function pop(html) { if (typeof modal === 'function') modal('<div class="pwa-modal">' + html + '</div>'); else alert(html.replace(/<[^>]+>/g, ' ')); }
  function toast(html) {
    var box = document.getElementById('toasts'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast pwa-toast'; t.innerHTML = html; box.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function pip(mood, size) { return typeof pipHTML === 'function' ? pipHTML(mood, size, '') : ''; }

  // ---------- service worker ----------
  function killedRecently() {
    if (/[?&]swoff=1/.test(location.search)) { // the kill switch (tools/sw-killswitch.js) sent us here
      set('off', String(Date.now()));
      try { history.replaceState(history.state, '', location.pathname + location.search.replace(/([?&])swoff=1&?/, '$1').replace(/[?&]$/, '') + location.hash); } catch (e) {}
    }
    var off = +get('off') || 0;
    if (!off) return Promise.resolve(false);
    if (Date.now() - off < 864e5) return Promise.resolve(true);
    // A day later: is sw.js still the kill switch?
    return fetch('sw.js', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
      if (t.indexOf('TATA_SW_OFF') >= 0) { set('off', String(Date.now())); return true; }
      set('off', null); return false;
    }, function () { return true; });
  }
  function register() {
    if (!SW_OK) return;
    killedRecently().then(function (off) {
      if (off) return;
      navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(function (r) {
        reg = r;
        if (r.waiting && navigator.serviceWorker.controller) gotWaiting(r.waiting);
        r.addEventListener('updatefound', function () {
          var w = r.installing; if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) gotWaiting(w);
            if (w.state === 'activated') ask();
          });
        });
        ask();
      }, function (e) { try { console.warn('[pwa] service worker not registered', e); } catch (x) {} });
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (applying) location.reload(); });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'TATA_SW_OFF') set('off', String(Date.now()));
    });
  }
  function ask() { // the active worker's version, for Settings
    var c = navigator.serviceWorker.controller; if (!c || typeof MessageChannel === 'undefined') return;
    var ch = new MessageChannel(); ch.port1.onmessage = function (e) { info = e.data; refreshSettings(); }; c.postMessage({ type: 'VERSION' }, [ch.port2]);
  }
  var lastCheck = 0;
  function check(force) {
    if (!reg || !online() || applying) return Promise.resolve();
    if (!force && Date.now() - lastCheck < 3e5) return Promise.resolve();
    lastCheck = Date.now();
    return reg.update().catch(function () {});
  }
  function quiet() { return (typeof current === 'undefined' || current === 'splash') && !modalOpen(); }
  function gotWaiting(w) {
    waiting = w;
    // At a cold start (still on the first "Tap to Play" screen, nothing begun) just switch: no chip needed.
    if (quiet() && Date.now() - bornAt < 6e4) { apply(); return; }
    paintChips(); refreshSettings();
  }
  function apply() {
    var w = waiting || (reg && reg.waiting);
    if (!w) { location.reload(); return; }
    applying = true;
    w.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(function () { location.reload(); }, 4000); // in case controllerchange never comes
  }
  function resetAll() {
    var jobs = [];
    if (SW_OK) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('tata-') === 0; }).map(function (k) { return caches.delete(k); })); }));
    return Promise.all(jobs).catch(function () {}).then(function () { location.reload(); });
  }
  function cacheMB() {
    if (!window.caches) return Promise.resolve(null);
    // Sum the bytes the game itself stored (storage.estimate() also counts padding and other data).
    return caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k.indexOf('tata-') === 0; }).map(function (k) {
        return caches.open(k).then(function (c) { return c.keys().then(function (rq) { return Promise.all(rq.map(function (q) { return c.match(q).then(function (r) { return r && r.type !== 'opaque' ? r.clone().arrayBuffer().then(function (b) { return b.byteLength; }) : 0; }); })); }); });
      }));
    }).then(function (all) { var n = 0; all.forEach(function (a) { a.forEach(function (b) { n += b; }); }); return n / 1048576; });
  }

  // ---------- chips on the title screen (and the offline chip) ----------
  var chipBox = null, offChip = null;
  function ensureBoxes() {
    if (!chipBox) { chipBox = document.createElement('div'); chipBox.id = 'pwaChips'; document.body.appendChild(chipBox); }
    if (!offChip) {
      offChip = document.createElement('div'); offChip.id = 'pwaOffline'; offChip.setAttribute('role', 'status');
      offChip.innerHTML = '<span class="pwa-dot"></span><span class="pwa-off-txt">Offline: playing on this device</span>';
      offChip.addEventListener('click', function () { offChip.classList.toggle('open'); });
      document.body.appendChild(offChip);
    }
  }
  function canInstall() { return !standalone() && (!!deferred || IOS); }
  function paintChips() {
    ensureBoxes();
    var title = on('title'), html = '';
    if (waiting && title) html += '<button class="pwa-chip pwa-update" data-act="pwaUpdate"><span class="pwa-spark">✨</span> New version ready: tap to update</button>';
    if (title && canInstall() && get('hint') !== 'done' && !waiting) {
      html += '<div class="pwa-card"><button class="pwa-x" data-act="pwaHintClose" aria-label="Close">×</button>' +
        '<b>For Tata:</b> put the game on the Home Screen. It opens full screen and plays without internet.' +
        '<div class="pwa-card-row"><button class="btn small yellow" data-act="pwaInstall">' + (deferred ? 'Install app' : 'Show me how') + '</button></div></div>';
    }
    chipBox.innerHTML = html;
    chipBox.classList.toggle('on', !!html);
    var inMatch = on('game') || on('onsets');
    offChip.classList.toggle('on', !online() && !inMatch);
    if (!online() && !offChip.dataset.shown) { offChip.dataset.shown = '1'; offChip.classList.add('open'); setTimeout(function () { offChip.classList.remove('open'); }, 5000); }
    if (online()) delete offChip.dataset.shown;
  }
  function watchScreens() {
    if (!window.MutationObserver) { setInterval(paintChips, 1500); return; }
    var mo = new MutationObserver(function () { paintChips(); if (on('title')) check(false); });
    ['title', 'game', 'onsets', 'splash'].forEach(function (id) { var el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); });
  }

  // ---------- things that need the internet: say so kindly instead of failing ----------
  var NEED_NET = { online: 'Playing online', acctGoogle: 'Signing in with Google', acctBackups: 'Cloud backups', acctRestore: 'Cloud backups', acctDeleteAsk: 'Deleting the cloud save', acctDeleteGo: 'Deleting the cloud save' };
  function needsNet(act) {
    if (NEED_NET[act]) return NEED_NET[act];
    if (act === 'acctOpen') { var st = window.Account && Account.status ? Account.status() : 'out'; return st === 'out' || st === 'off' ? 'Signing in' : ''; }
    return '';
  }
  function offlineSay(what) {
    pop(pip('think', 90) + '<h2>You\'re offline</h2><p style="text-align:center">' + (what ? '<b>' + what + '</b> needs' : 'This needs') + ' the internet. Everything else works right here: matches against the creatures, Training Camp, On-Sets, puzzles. Your progress is saved on this device.</p>' +
      '<div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
  }
  window.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('[data-act]');
    if (a && !online()) { var what = needsNet(a.dataset.act); if (what) { e.stopImmediatePropagation(); e.preventDefault(); offlineSay(what); return; } }
    // Home-screen app: links to other sites open in the browser, not inside the app.
    var l = e.target && e.target.closest && e.target.closest('a[href]');
    if (l && standalone()) {
      var u; try { u = new URL(l.href, location.href); } catch (x) { return; }
      var scope = location.origin + location.pathname.replace(/[^/]*$/, '');
      if (/^https?:$/.test(u.protocol) && u.href.indexOf(scope) !== 0) { e.preventDefault(); e.stopImmediatePropagation(); window.open(u.href, '_blank', 'noopener'); }
    }
  }, true);

  // ---------- install helper ----------
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; paintChips(); refreshSettings(); });
  window.addEventListener('appinstalled', function () { deferred = null; set('hint', 'done'); paintChips(); refreshSettings(); toast('<span style="font-size:26px">📲</span> Installed! Look for the Equations icon.'); });
  var SHARE_SVG = '<svg viewBox="0 0 24 24" class="pwa-glyph" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var ADD_SVG = '<svg viewBox="0 0 24 24" class="pwa-glyph" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  function moveSaveHTML() {
    var who = (typeof S !== 'undefined' && S.name) ? S.name + '\'s' : 'Your';
    return '<div class="pwa-note"><b>' + who + ' progress:</b> on iPad and iPhone the home-screen app keeps its <i>own</i> save, separate from Safari. To bring it over, either ' +
      '<b>sign in with Google</b> once inside the app (Settings, Account; needs internet), or in Safari copy the code in <b>Settings, Move progress to another device</b>, then open the app and paste it there (tap <b>Load</b>). Do this before playing in the app.</div>';
  }
  function iosSteps() {
    pop('<h2>Put it on the Home Screen</h2>' +
      '<ol class="pwa-steps">' +
      '<li><span class="pwa-ico">' + SHARE_SVG + '</span><div>In <b>Safari</b>, tap the <b>Share</b> button (the square with an arrow, top right on iPad, bottom on iPhone).</div></li>' +
      '<li><span class="pwa-ico">' + ADD_SVG + '</span><div>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</div></li>' +
      '<li><span class="pwa-ico pwa-ico-app"><img src="assets/icons/apple-touch-icon-120.png" alt=""></span><div>Open the new <b>Equations</b> icon once while online. After that it plays without internet.</div></li>' +
      '</ol>' + moveSaveHTML() +
      '<div class="row"><button class="btn" data-act="closeModal">Got it</button></div>');
  }
  function otherSteps() {
    pop('<h2>Install the game</h2><p>In Chrome or Edge, use the install icon in the address bar, or the browser menu, then <b>Install app</b> / <b>Add to Home screen</b>. Open it once while online; after that it plays without internet.</p>' +
      '<div class="pwa-note">On a phone or tablet the installed app may keep its own save. Sign in with Google inside the app, or use the code in <b>Settings, Move progress to another device</b>.</div>' +
      '<div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
  }
  function install() {
    if (deferred) {
      var d = deferred; deferred = null;
      d.prompt();
      (d.userChoice || Promise.resolve({})).then(function (c) { if (c && c.outcome === 'accepted') set('hint', 'done'); paintChips(); refreshSettings(); });
      return;
    }
    if (IOS) iosSteps(); else otherSteps();
  }

  // ---------- Settings rows ----------
  function refreshSettings() {
    var typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (on('settings') && typeof renderSettings === 'function' && !modalOpen() && !typing) { var sc = document.getElementById('settings').scrollTop; renderSettings(); document.getElementById('settings').scrollTop = sc; } }
  function esc2(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function settingsHTML() {
    var ctl = SW_OK && navigator.serviceWorker.controller;
    var state = standalone() ? '✔ Running as the home-screen app.' : 'Running in the browser.';
    var offline = !SW_OK ? 'This browser cannot keep the game for offline play.' : ctl ? '✔ Ready to play without internet' + (info ? ' (version ' + esc2(info.version) + ')' : '') + '.' : 'Getting ready for offline play… (open the game once more while online)';
    var html = '<div class="group pwa-group"><h3>📲 App on this device</h3>' +
      '<div class="setrow"><label>' + state + '<br><small style="font-weight:600">' + offline + ' <span id="pwaSize"></span></small></label>' +
      (canInstall() ? '<button class="btn small yellow" data-act="pwaInstall">' + (deferred ? 'Install app' : 'How to install') + '</button>' : '') + '</div>';
    if (IOS && !standalone()) html += '<div class="setrow"><label>Moving progress into the home-screen app<br><small style="font-weight:600">The app on the Home Screen has its own save. Sign in with Google inside it, or copy the code below and paste it there.</small></label></div>';
    html += '<div class="setrow"><label>' + (waiting ? '✨ A new version is ready.' : 'Updates arrive by themselves when online.') + '</label>' +
      (waiting ? '<button class="btn small green" data-act="pwaUpdate">Update now</button>' : (ctl ? '<button class="btn small" data-act="pwaCheck">Check now</button>' : '')) + '</div></div>';
    setTimeout(function () { cacheMB().then(function (mb) { var el = document.getElementById('pwaSize'); if (el && mb) el.textContent = '(' + mb.toFixed(1) + ' MB stored)'; }); }, 0);
    return html;
  }
  function parentRowHTML() {
    return '<div class="setrow"><label>Reset app cache<br><small style="font-weight:600">If the game ever looks stuck on an old version. Deletes the offline copy (not progress) and reloads from the internet.</small></label><button class="btn small pink" data-act="pwaResetAsk">Reset app cache</button></div>';
  }

  // ---------- actions ----------
  if (typeof ACT !== 'undefined') {
    ACT.pwaUpdate = function () { apply(); };
    ACT.pwaInstall = function () { install(); };
    ACT.pwaIosSteps = function () { iosSteps(); };
    ACT.pwaHintClose = function () { set('hint', 'done'); paintChips(); };
    ACT.pwaCheck = function () {
      if (!online()) { offlineSay('Checking for a new version'); return; }
      check(true).then(function () { setTimeout(function () { if (!waiting && !(reg && reg.installing)) toast('<span style="font-size:24px">✔</span> You have the newest version.'); else if (reg && reg.installing) toast('<span style="font-size:24px">⬇</span> Downloading the new version…'); }, 1500); });
    };
    ACT.pwaResetAsk = function () {
      if (!online()) { pop('<h2>Not while offline</h2><p style="text-align:center">Resetting removes the offline copy, and the game would need the internet to load again. Try when you are online.</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>'); return; }
      pop('<h2>Reset app cache?</h2><p style="text-align:center">The offline copy of the game is deleted and downloaded fresh. Progress, names and settings stay.</p><div class="row"><button class="btn" data-act="closeModal">Cancel</button><button class="btn pink" data-act="pwaResetGo">Reset and reload</button></div>');
    };
    ACT.pwaResetGo = function () { resetAll(); };
  }

  // ---------- home-screen app manners ----------
  function standaloneManners() {
    if (!standalone()) return;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false }); // iOS page pinch-zoom
    if (!IOS && history.pushState) { // Android back button: close the pop-up or go back to the menu, never quit mid-match
      try { history.pushState({ pwa: 1 }, ''); } catch (e) {}
      window.addEventListener('popstate', function () {
        try { history.pushState({ pwa: 1 }, ''); } catch (e) {}
        if (modalOpen()) { if (typeof closeModal === 'function') closeModal(); return; }
        if (typeof current !== 'undefined' && ['title', 'splash', 'game', 'onsets', 'intro'].indexOf(current) < 0 && ACT.home) ACT.home();
      });
    }
  }

  // ---------- start ----------
  cls();
  window.addEventListener('online', function () { cls(); paintChips(); check(true); });
  window.addEventListener('offline', function () { cls(); paintChips(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(false); });
  setInterval(function () { if (document.visibilityState === 'visible') check(false); }, 18e5);
  function boot() { ensureBoxes(); watchScreens(); paintChips(); standaloneManners(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register);

  return {
    settingsHTML: settingsHTML, parentRowHTML: parentRowHTML, install: install, iosSteps: iosSteps,
    standalone: standalone, online: online, update: apply, check: function () { return check(true); }, reset: resetAll,
    state: function () { return { sw: SW_OK, controlled: !!(SW_OK && navigator.serviceWorker.controller), waiting: !!waiting, installable: !!deferred, ios: IOS, standalone: standalone(), info: info }; },
    cacheMB: cacheMB
  };
})();
