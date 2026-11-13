'use strict';
// ======================= WHAT'S NEW TOUR =======================
// A gentle, one-time guide on the title screen: Pip points at each new thing once (a spotlight on the menu tile, a
// short sentence, Next / Skip). Tiles with something he has not opened yet carry a still "✨ New" badge, cleared the
// first time he opens it. Settings can replay the tour (ACT.tourReplay).
//
// Rules (the owner's): never during a match, never before the tutorial is done (or before he has played a few
// shakes), one stop at a time, each stop shown once, at most 6 stops per version, no looping animation (the
// spotlight pulses softly once, then stays still), plain kid words, Skip always there.
//
// Adding things for a future version: add stops at the end of STOPS with the next v. That's all: VERSION follows.
//   id     unique key (saved in S.tour.seen / S.tour.opened)
//   v      the version that brought it
//   at     the data-tile of the title menu tile to point at (js/ui.js gotoTitle)
//   acts   ACT handler names that count as "opened" (clears the New badge); clicking the tile itself also counts
//   dot    false = no New badge for this stop (only the tour)
//   need   optional function: false = this game build doesn't have it (stop and badge are left out)
//   mood   Pip's face: happy / cheer / think
//   title, text   what Pip says (short, kind, plain words)
//
// Save: S.tour = { v: <last version he finished or skipped>, seen: { id: 1 }, opened: { id: 1 } }
// API: Tour.maybeStart(force) · Tour.replay() · Tour.badgeHTML(tile) · Tour.markOpened(tile) · Tour.onScreen(id)
//      Tour.running() · Tour.STOPS · Tour.VERSION
var Tour = (function () {
  function has3d() { return typeof T3 !== 'undefined' && T3.supported && S.set.three !== false; }
  var STOPS = [
    { id: 'look', v: 1, at: 'play', dot: false, need: has3d, mood: 'cheer', title: 'Look around!',
      text: 'In a match, drag the background to look all around the stadium. Tap the camera button to take a photo!' },
    { id: 'trio', v: 1, at: 'p3', acts: ['menu3p', 'trioPick', 'playTrio', 'mmTrios'], need: function () { return !!window.Trio; }, mood: 'happy', title: '3 Players',
      text: 'Three at the table: play against two creatures at once! Or play a family game with three people.' },
    { id: 'kit', v: 1, at: 'kit', acts: ['openKit'], need: function () { return typeof Kit !== 'undefined'; }, mood: 'happy', title: 'My kit',
      text: 'Make an away kit, pick a crest and choose new boots. Then wear them on the pitch!' },
    { id: 'season', v: 1, at: 'season', acts: ['season'], need: function () { return !!window.Season; }, mood: 'happy', title: 'Season Table',
      text: 'Every match counts in the Season Table. Finish near the top to win a pennant for your Trophy Cabinet!' },
    { id: 'fans', v: 1, at: 'trophies', acts: ['trophies', 'cabinet', 'fans'], need: function () { return !!(window.Cabinet || window.Fans); }, mood: 'cheer', title: 'Trophy Room',
      text: 'Walk around your Trophy Cabinet. And in a match, zoom in on the crowd to Spot the Fan!' },
    { id: 'parent', v: 1, at: 'settings', acts: ['settings'], need: function () { return !!(window.Vari || window.Bonus); }, mood: 'think', title: 'For Tata',
      text: 'Grown-ups: variation cards and bonus dice can be switched on or off in Settings, in the Parent corner.' }
  ];
  var MAX_STOPS = 6;
  var VERSION = STOPS.reduce(function (m, s) { return Math.max(m, s.v); }, 0);

  function st() {
    if (!S.tour || typeof S.tour !== 'object') S.tour = {};
    if (typeof S.tour.v !== 'number') S.tour.v = 0;
    if (!S.tour.seen || typeof S.tour.seen !== 'object') S.tour.seen = {};
    if (!S.tour.opened || typeof S.tour.opened !== 'object') S.tour.opened = {};
    return S.tour;
  }
  function save() { if (typeof persist === 'function') persist(); }
  function avail(s) { try { return !s.need || !!s.need(); } catch (e) { return false; } }
  // not on a brand-new save: after the tutorial, or once he has played a few shakes anyway
  function ready() { return !!(S.tutorialDone || (S.stats && S.stats.shakes >= 3)); }
  function inMatch() { return typeof G !== 'undefined' && !!G; }
  function modalUp() { var m = document.getElementById('modal'), b = document.getElementById('builder'); return !!((m && m.classList.contains('on')) || (b && b.classList.contains('on'))); }
  function target(s) { return document.querySelector('#title [data-tile="' + s.at + '"]'); }

  // ---------- "✨ New" badges ----------
  var wrapped = {};
  function wrapActs() {   // lazy: some handlers (the menu choosers) are only made on the first title
    if (typeof ACT === 'undefined') return;
    STOPS.forEach(function (s) {
      (s.acts || []).forEach(function (a) {
        if (wrapped[a] || typeof ACT[a] !== 'function') return;
        wrapped[a] = true;
        var f = ACT[a];
        ACT[a] = function () { openedStop(s); return f.apply(this, arguments); };
      });
    });
  }
  function openedStop(s) {
    var t = st();
    if (t.opened[s.id]) return;
    t.opened[s.id] = 1; save();
    var still = STOPS.some(function (o) { return o.at === s.at && o.dot !== false && !t.opened[o.id] && avail(o); });
    if (!still) { var b = document.querySelector('#title [data-tile="' + s.at + '"] .mm-new'); if (b) b.remove(); }
  }
  function markOpened(tile) { STOPS.forEach(function (s) { if (s.at === tile) openedStop(s); }); }
  function badgeHTML(tile) {
    wrapActs();
    if (!ready()) return '';
    var t = st();
    var on = STOPS.some(function (s) { return s.at === tile && s.dot !== false && !t.opened[s.id] && avail(s); });
    return on ? '<span class="mm-new"><span aria-hidden="true">✨</span> New</span>' : '';
  }
  // tapping a tile counts as opening what is new on it
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#title [data-tile]');
    if (b && !run) markOpened(b.dataset.tile);
  }, true);

  // ---------- the tour ----------
  var run = null, waitT = null, forceNext = false;
  function pending(all) {
    var t = st();
    return STOPS.filter(function (s) { return avail(s) && (all ? s.v === VERSION : !t.seen[s.id]); }).slice(0, MAX_STOPS);
  }
  function maybeStart(force) {
    force = force || forceNext; forceNext = false;
    wrapActs();
    if (run) return;
    if (!force && !ready()) return;
    var list = pending(force);
    if (!list.length) return;
    clearTimeout(waitT);
    var t0 = Date.now();
    (function check() {
      if (typeof current !== 'undefined' && current !== 'title') return;   // he went somewhere else: try again next time
      if (inMatch()) return;
      var el = document.getElementById('title');
      var opening = el && el.classList.contains('t3') && !el.classList.contains('t3-rest') && Date.now() - t0 < 9000;
      if (opening || modalUp() || Date.now() - t0 < 900) { waitT = setTimeout(check, 300); return; }
      begin(list);
    })();
  }
  function replay() {
    forceNext = true;
    if (typeof closeModal === 'function' && modalUp()) closeModal();
    if (typeof gotoTitle === 'function') gotoTitle(); else maybeStart(true);
  }

  var box, spot, card, lastFocus = null;
  function build() {
    box = document.createElement('div');
    box.id = 'tour';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'tourT'); box.setAttribute('aria-describedby', 'tourX');
    box.innerHTML = '<div class="tour-spot"></div><div class="tour-card"><span class="tour-arrow"></span><div class="tour-pip"></div><div class="tour-body">' +
      '<div class="tour-step"></div><h3 id="tourT"></h3><p id="tourX"></p>' +
      '<div class="tour-btns"><button type="button" class="btn small tour-skip" data-tour="skip">Skip</button><button type="button" class="btn small green tour-next" data-tour="next">Next</button></div></div></div>';
    document.body.appendChild(box);
    spot = box.querySelector('.tour-spot'); card = box.querySelector('.tour-card');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tour]');
      e.stopPropagation();
      if (!b) return;
      if (b.dataset.tour === 'next') next(); else skip();
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); skip(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'Tab') {   // keep focus on the two buttons
        var a = box.querySelector('.tour-skip'), z = box.querySelector('.tour-next');
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }
  function begin(list) {
    if (!box) build();
    run = { list: list, i: -1 };
    lastFocus = document.activeElement;
    document.body.classList.add('tour-on');
    box.classList.add('on');
    next(true);
  }
  function show() {
    var s = run.list[run.i], el = target(s);
    st().seen[s.id] = 1; save();
    var n = run.list.length;
    box.querySelector('.tour-pip').innerHTML = pipHTML(s.mood || 'happy', 58, '');
    box.querySelector('.tour-step').textContent = (n > 1 ? (run.i + 1) + ' of ' + n + ' · ' : '') + 'What\'s new';
    box.querySelector('#tourT').textContent = s.title;
    box.querySelector('#tourX').textContent = s.text;
    box.querySelector('.tour-next').innerHTML = run.i === n - 1 ? 'Got it!' : 'Next ' + (typeof ico === 'function' ? ico('play') : '');
    box.querySelector('.tour-skip').style.display = run.i === n - 1 ? 'none' : '';
    try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    place();
    spot.classList.remove('pulse'); void spot.offsetWidth; spot.classList.add('pulse');   // one soft pulse, then still
    if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop();
    box.querySelector('.tour-next').focus({ preventScroll: true });
  }
  function next(first) {
    if (!run) return;
    do { run.i++; } while (run.i < run.list.length && !target(run.list[run.i]));   // a tile that isn't on screen is left for next time
    if (run.i >= run.list.length) { finish(); return; }
    if (!first && typeof Snd !== 'undefined' && Snd.click) Snd.click();
    show();
  }
  function skip() {
    if (!run) return;
    var t = st(); run.list.forEach(function (s) { t.seen[s.id] = 1; });
    if (typeof Snd !== 'undefined' && Snd.click) Snd.click();
    finish();
  }
  function finish() {
    var t = st(); t.v = Math.max(t.v, VERSION); save();
    run = null;
    if (box) { box.classList.remove('on'); spot.classList.remove('pulse'); }
    document.body.classList.remove('tour-on');
    if (lastFocus && lastFocus.focus && document.body.contains(lastFocus)) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    lastFocus = null;
  }
  // the spotlight on the tile; the card beside it (left of the panel when it is on the right, above it in portrait)
  function place() {
    if (!run) return;
    var el = target(run.list[run.i]); if (!el) return;
    var r = el.getBoundingClientRect(), pad = 6, W = innerWidth, H = innerHeight;
    spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + 2 * pad) + 'px'; spot.style.height = (r.height + 2 * pad) + 'px';
    var cw = card.offsetWidth, ch = card.offsetHeight, gap = 16, x, y, side;
    // when the menu panel is on the right, the card goes left of the whole panel so it never hides other tiles
    var pn = el.closest('.t-panel'), pr = pn ? pn.getBoundingClientRect() : null, edge = (pr && pr.left > W * 0.45) ? Math.min(pr.left + pad, r.left) : r.left;
    if (edge - pad - gap - 12 >= cw && r.left > W * 0.45) {   // to the left
      side = 'left'; x = edge - pad - gap - cw; y = Math.min(Math.max(12, r.top + r.height / 2 - ch / 2), H - ch - 12);
    } else if (r.top - pad - gap - 12 >= ch) {          // above
      side = 'above'; y = r.top - pad - gap - ch; x = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), W - cw - 12);
    } else {                                              // below
      side = 'below'; y = Math.min(r.bottom + pad + gap, H - ch - 12); x = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), W - cw - 12);
    }
    card.style.left = Math.round(x) + 'px'; card.style.top = Math.round(y) + 'px';
    card.className = 'tour-card side-' + side;
    var a = card.querySelector('.tour-arrow');
    if (side === 'left') { a.style.top = Math.round(Math.min(Math.max(18, r.top + r.height / 2 - y), ch - 18)) + 'px'; a.style.left = ''; }
    else { a.style.left = Math.round(Math.min(Math.max(22, r.left + r.width / 2 - x), cw - 22)) + 'px'; a.style.top = ''; }
  }
  addEventListener('resize', function () { if (run) place(); });
  // leaving the title (a match starts, a screen opens) always closes the tour; what is not seen yet waits for next time
  function onScreen(id) {
    if (id !== 'title') clearTimeout(waitT);
    if (run && id !== 'title') { run = null; if (box) box.classList.remove('on'); document.body.classList.remove('tour-on'); }
  }

  if (typeof ACT !== 'undefined') ACT.tourReplay = function () { replay(); };

  return { STOPS: STOPS, VERSION: VERSION, maybeStart: maybeStart, replay: replay, badgeHTML: badgeHTML, markOpened: markOpened, onScreen: onScreen,
    running: function () { return !!run; } };
})();
