'use strict';
// ======================= SPOT THE FAN =======================
// About 6.5% of the stadium crowd are "character" fans (js/three/crowd.js). When he zooms in on the stands and taps
// one, it is spotted: a cheerful toast, that fan waves once, and the character goes into the album (#fans screen).
// Each character is collected once; the album also remembers where he saw it (stadium, night match, beach).
// Nothing is timed, nothing can be missed or lost, and the same fans sit in the same seats every time (the crowd is
// dressed from a fixed seed per venue), so a character he has seen can always be found again.
//
// Needs (all feature-detected; without them the album still shows, everything as silhouettes):
//   T3.ctx.hooks.tap      the tap hook in js/three/table.js
//   T3.crowdPick(ray)     js/three/crowd.js: the fan under the pointer
//   T3.crowdWave(i)       js/three/crowd.js: that fan waves once
// API: Fans.open()  show the album · Fans.count() -> {found, total} · Fans.buttonHTML(cls) · Fans.LIST
//      Fans.onTap(ray, info)  (installed on T3.ctx.hooks.tap automatically) · Fans.spot(kind, venue) (also for tests)
// Tap handlers added: ACT.fans, ACT.fansBack, ACT.fanView.
// Save shape: S.fans = { v: 1, k: { <kind>: { d: 'YYYY-MM-DD', at: ['stadium', 'beach', ...] (at most 4) } } }
var Fans = (function () {
  var LIST = [
    { k: 'astronaut', name: 'Astronaut', emoji: '🧑‍🚀', hint: 'Wears a round space helmet with a dark visor.' },
    { k: 'chef', name: 'Chef', emoji: '🧑‍🍳', hint: 'Wears a tall white hat.' },
    { k: 'knight', name: 'Knight', emoji: '🛡️', hint: 'Wears shiny grey armour and a helmet.' },
    { k: 'skeleton', name: 'Skeleton', emoji: '💀', hint: 'A black costume with white bones on it.' },
    { k: 'robot', name: 'Robot', emoji: '🤖', hint: 'A metal head with square eyes. Beep boop!' },
    { k: 'hero', name: 'Superhero', emoji: '🦸', hint: 'Has a cape and a lightning bolt on the shirt.' },
    { k: 'wolf', name: 'Wolf Mascot', emoji: '🐺', hint: 'A grey furry mascot with pointy ears.' },
    { k: 'bear', name: 'Bear Mascot', emoji: '🐻', hint: 'A brown furry mascot with round ears.' },
    { k: 'cat', name: 'Cat Mascot', emoji: '🐱', hint: 'An orange furry mascot. Meow!' },
    { k: 'wizard', name: 'Wizard', emoji: '🧙', hint: 'A pointy purple hat with stars, and a long white beard.' },
    { k: 'fire', name: 'Firefighter', emoji: '🧑‍🚒', hint: 'Wears a red helmet and a dark coat with yellow stripes.' },
    { k: 'police', name: 'Police Officer', emoji: '👮', hint: 'A blue shirt, a peaked cap and a star badge.' },
    { k: 'builder', name: 'Builder', emoji: '👷', hint: 'A yellow hard hat and an orange safety vest.' }
  ];
  var VENUES = { stadium: 'Stadium', night: 'Night match', beach: 'Beach', volcano: 'Volcano' };
  var MIN_PX = 18;    // the fan's body must look at least this big (radius in pixels; 9-14 px from the seat on a laptop): zoom in to spot them
  var XP_NEW = 15;
  var hintShown = false;

  function E(s) { return typeof esc === 'function' ? esc(s) : String(s); }
  function I(n) { return typeof ico === 'function' ? ico(n) : ''; }
  function byKind(k) { for (var i = 0; i < LIST.length; i++) if (LIST[i].k === k) return LIST[i]; return null; }
  function dayStr() { if (typeof today === 'function') return today(); return new Date().toISOString().slice(0, 10); }
  function snd(n) { try { if (typeof Snd !== 'undefined' && Snd && typeof Snd[n] === 'function') Snd[n](); } catch (e) {} }
  function state() {
    if (typeof S === 'undefined') return { v: 1, k: {} };
    var f = S.fans;
    if (!f || typeof f !== 'object' || Array.isArray(f)) f = S.fans = { v: 1, k: {} };
    if (!f.k || typeof f.k !== 'object') f.k = {};
    return f;
  }
  function count() { var k = state().k, n = 0; LIST.forEach(function (c) { if (k[c.k]) n++; }); return { found: n, total: LIST.length }; }
  function venue() { var m = typeof S !== 'undefined' && S.cos && S.cos.mat; return VENUES[m] ? m : 'stadium'; }

  // Record a spot. Returns 'new' | 'place' (seen before, first time at this venue) | 'again' | '' (unknown kind).
  function spot(kind, where) {
    var c = byKind(kind); if (!c) return '';
    var st = state(), rec = st.k[kind];
    where = where || venue();
    if (!rec) {
      st.k[kind] = { d: dayStr(), at: [where] };
      if (typeof addXP === 'function') addXP(XP_NEW, 'Spotted the ' + c.name + ' in the crowd!');
      if (typeof persist === 'function') persist();
      return 'new';
    }
    if (!Array.isArray(rec.at)) rec.at = [];
    if (rec.at.indexOf(where) < 0 && rec.at.length < 4) { rec.at.push(where); if (typeof persist === 'function') persist(); return 'place'; }
    return 'again';
  }
  function toast(html, emoji) {
    var box = document.getElementById('toasts'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast fan-toast';
    t.innerHTML = '<span class="fan-tico">' + emoji + '</span><div>' + html + '</div>';
    box.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; }, 3400);
    setTimeout(function () { t.remove(); }, 4000);
  }
  // the tap hook: ray is a world-space THREE.Ray, info = {x, y, w, h, camera}
  function onTap(ray, info) {
    if (!window.T3 || !T3.crowdPick || typeof current !== 'undefined' && current !== 'game') return;
    var hit = T3.crowdPick(ray); if (!hit || !hit.kind) return;
    var cam = info && info.camera, h = (info && info.h) || 600;
    var px = cam && cam.fov ? hit.r / Math.max(0.01, hit.t) * (h / 2) / Math.tan(cam.fov * Math.PI / 360) : 999;
    var c = byKind(hit.kind); if (!c) return;
    if (px < MIN_PX) {
      if (!hintShown) { hintShown = true; toast('<small>PSST!</small>Someone in a costume is sitting there. Zoom in closer on the stands to see who it is!', '🔍'); }
      return;
    }
    var how = spot(hit.kind, venue()), n = count();
    if (T3.crowdWave) T3.crowdWave(hit.i);
    if (how === 'new') {
      snd('chime'); if (typeof FX !== 'undefined' && FX.burst) try { FX.burst(info.x || innerWidth / 2, info.y || innerHeight / 2, 30); } catch (e) {}
      toast('<small>FAN SPOTTED!</small>You found the ' + E(c.name) + '! <b>' + n.found + ' of ' + n.total + '</b>', c.emoji);
    } else if (how === 'place') {
      snd('pop'); toast('<small>NEW PLACE!</small>The ' + E(c.name) + ' is at the ' + E(VENUES[venue()]) + ' too!', c.emoji);
    } else {
      snd('pop'); toast('<small>HI AGAIN!</small>The ' + E(c.name) + ' waves at you!', c.emoji);
    }
  }
  var hooked = false;
  function hook() {
    if (hooked) return true;
    var h = window.T3 && T3.ctx && T3.ctx.hooks;
    if (!h || !Array.isArray(h.tap)) return false;
    h.tap.push(onTap); hooked = true; return true;
  }
  if (typeof window !== 'undefined') {
    if (!hook()) {
      document.addEventListener('DOMContentLoaded', hook);
      window.addEventListener('load', hook);
    }
  }

  // ---------- the album ----------
  function cardHTML(c) {
    var rec = state().k[c.k];
    if (!rec) return '<div class="fan-card off" data-act="fanView" data-arg="' + c.k + '"><div class="fan-pic"><span class="fan-emo sil">' + c.emoji + '</span></div><b>???</b><small>' + E(c.hint) + '</small></div>';
    var at = (rec.at || []).map(function (v) { return VENUES[v] || v; }).join(', ');
    return '<div class="fan-card" data-act="fanView" data-arg="' + c.k + '"><div class="fan-pic"><span class="fan-emo">' + c.emoji + '</span></div><b>' + E(c.name) + '</b><small>Seen at: ' + E(at) + '</small></div>';
  }
  function render() {
    var n = count(), pct = Math.round(100 * n.found / n.total);
    var html = '<div class="hdr"><button class="btn small" data-act="fansBack">' + I('back') + ' Back</button><h2>🔍 Spot the Fan</h2></div>' +
      '<div class="panel fan-panel"><div class="fan-head"><div class="fan-count">' + n.found + ' of ' + n.total + ' found</div><div class="fan-bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<p class="fan-how">Some fans in the crowd dress up! In a match, zoom in on the stands (scroll, pinch, or two fingers on a tablet) and tap a fan in a costume to add them here. They always sit in the same seats, so you can visit them again.</p>' +
      '<div class="fan-grid">' + LIST.map(cardHTML).join('') + '</div>' +
      (n.found === n.total ? '<p class="fan-all">🎉 You found every fan! The crowd salutes you.</p>' : '') +
      '</div>';
    var el = document.getElementById('fans'); if (el) el.innerHTML = html;
    return html;
  }
  var backTo = 'trophies';
  function open() { if (typeof current !== 'undefined' && current && current !== 'fans') backTo = current; render(); if (typeof go === 'function') go('fans'); }
  function buttonHTML(cls) { var n = count(); return '<button class="btn ' + (cls || 'green') + '" data-act="fans">🔍 Spot the Fan <small class="fan-btnc">' + n.found + '/' + n.total + '</small></button>'; }
  if (typeof ACT !== 'undefined') {
    ACT.fans = function () { snd('click'); open(); };
    ACT.fansBack = function () { if (backTo === 'trophies' && ACT.trophies) ACT.trophies(); else if (backTo === 'cabinet' && window.Cabinet) Cabinet.open(); else if (typeof gotoTitle === 'function') gotoTitle(); };
    ACT.fanView = function (el) {
      var c = byKind(el.dataset.arg); if (!c || typeof modal !== 'function') return;
      var rec = state().k[c.k];
      snd('click');
      modal(rec ? '<h2>' + c.emoji + ' ' + E(c.name) + '</h2><p style="text-align:center">Spotted on ' + E(rec.d) + '.<br>Seen at: ' + E((rec.at || []).map(function (v) { return VENUES[v] || v; }).join(', ')) + '.</p><p style="text-align:center;color:var(--mute)">' + E(c.hint) + '</p><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>'
        : '<h2>Who is it?</h2><div style="text-align:center"><span class="fan-emo sil big">' + c.emoji + '</span></div><p style="text-align:center">' + E(c.hint) + '</p><p style="text-align:center;color:var(--mute)">Look for this fan in the stands during a match. Zoom in, then tap!</p><div class="row"><button class="btn green" data-act="closeModal">I will look!</button></div>');
    };
  }
  return { LIST: LIST, VENUES: VENUES, open: open, render: render, count: count, buttonHTML: buttonHTML, onTap: onTap, spot: spot, hook: hook, state: state, MIN_PX: MIN_PX };
})();
