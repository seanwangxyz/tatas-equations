'use strict';
// ======================= PLAYERS ON THIS DEVICE =======================
// The save's own player ("You") and up to People.MAX_CREW others (family and friends) who play on this device,
// each with their own look (js/avatar.js) and kit (js/kit.js). Data: People (js/people-data.js), S.crew.
//
//   Crew.open()               the "Players" list: Edit anyone, Remove the others, Add a player
//   Crew.choose(opts, cb)     "Who is playing?" for a seat. opts.exclude: ids already in another seat ('own' = the save's
//                             own player); opts.title: another heading; opts.onCancel(): the Back button (optional).
//                             cb(person) with person = Crew.person(id), or cb(null) for "Guest". "Someone new" opens the
//                             maker and then picks the new player.
//   Crew.person(id)           { id: 'own' | 'c..', name, jersey, back (the printed back name), avatar, kit (saved shape) } or null
//   Crew.faceHTML(p, size)    a small round picture of someone (3D portrait once ready, the flat drawing meanwhile)
var Crew = (function () {
  function bn() { return typeof backName === 'function' ? backName() : String(S.backName || S.name || ''); }
  function person(id) {
    if (id === 'own') return { id: 'own', name: String(S.name || ''), jersey: String(S.jersey || '7'), back: bn(), avatar: People.own(), kit: window.Kit ? Kit.current() : (S.kit || {}) };
    var m = People.member(id);
    return m ? { id: m.id, name: m.name, jersey: m.jersey, back: People.backOf(m), avatar: m.avatar, kit: People.kitOf(m) } : null;
  }
  function everyone() { return [person('own')].concat(People.crew().map(function (m) { return person(m.id); })); }
  // ---------- small round pictures, cached; 3D portraits drawn one at a time ----------
  var cache = {}, queue = [], busy = false;
  function has3D() { return typeof T3 !== 'undefined' && T3 && T3.playerPortrait && T3.ctx && S.set && S.set.three !== false; }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'f' + (h >>> 0).toString(36); }
  function fullKit(k) { return window.Kit && Kit.fill ? Kit.fill(k) : (k || {}); }
  function keyOf(p) { return hash(JSON.stringify([People.clean(p.avatar), fullKit(p.kit), String(p.jersey || ''), String(p.back || '')])); }
  function pump() {
    if (busy || !queue.length || !has3D()) return;
    var job = queue.shift(); busy = true;
    var a = People.clean(job.p.avatar), k = Object.assign({}, fullKit(job.p.kit)); k.hair = a.hair;
    if (['swept', 'short', 'spiky', 'curly', 'long'].indexOf(a.hairStyle) >= 0) k.hairStyle = a.hairStyle;
    T3.playerPortrait({ avatar: a, kit: k, name: String(job.p.back || ''), number: String(job.p.jersey || '7') }, 160, 'face').then(function (url) {
      busy = false;
      if (url) { cache[job.k] = url; document.querySelectorAll('[data-face="' + job.k + '"]').forEach(function (el) { var img = el.querySelector('img'); if (img) img.src = url; el.classList.add('ready'); }); }
      setTimeout(pump, 30);
    }, function () { busy = false; setTimeout(pump, 30); });
  }
  function faceHTML(p, size) {
    if (!p) return '';
    size = Math.max(24, +size || 56);
    var k = keyOf(p), url = cache[k];
    if (!url && has3D() && !queue.some(function (j) { return j.k === k; })) { queue.push({ k: k, p: p }); setTimeout(pump, 0); }
    return '<span class="cr-face' + (url ? ' ready' : '') + '" data-face="' + k + '" style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true">' +
      Avatar.flat({ avatar: p.avatar, kit: p.kit, number: p.jersey, name: p.back }, 'front', 'head') + '<img alt="" src="' + (url || '') + '"></span>';
  }
  function forget() { queue = []; }      // pictures are keyed by the look itself, so nothing stale is ever shown
  function pop() { if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop(); }
  function icon(n) { return typeof ico === 'function' ? ico(n) : ''; }
  // ---------- the players list ----------
  function card(p) {
    var own = p.id === 'own', nm = own && (!p.name || p.name === 'Champ') ? 'You' : p.name;
    return '<div class="cr-card">' + faceHTML(p, 84) + '<div class="cr-who"><b>' + esc(nm) + '</b><span class="cr-num" aria-label="Shirt number ' + esc(p.jersey) + '">' + esc(p.jersey) + '</span>' + (own && nm !== 'You' ? '<span class="cr-you">You</span>' : '') + '</div>' +
      '<div class="cr-btns"><button type="button" class="btn small" data-act="crEdit" data-arg="' + esc(p.id) + '" aria-label="Edit ' + esc(nm) + '">' + icon('pencil') + ' Edit</button>' +
      (own ? '' : '<button type="button" class="btn small" data-act="crRemove" data-arg="' + esc(p.id) + '" aria-label="Remove ' + esc(nm) + '">Remove</button>') + '</div></div>';
  }
  function listHTML() {
    var room = People.crew().length < People.MAX_CREW;
    return '<div class="cr"><h2>' + icon('people') + ' Players</h2><p class="cr-sub">Everyone who plays on this device, each with their own look and kit.</p><div class="cr-list">' +
      everyone().map(card).join('') +
      (room ? '<button type="button" class="cr-card cr-add" data-act="crAdd"><span class="cr-plus" aria-hidden="true">+</span><b>Add a player</b></button>' : '') + '</div>' +
      (room ? '' : '<p class="cr-sub">The list is full (' + People.MAX_CREW + ' players). Remove one to add someone new.</p>') +
      '<div class="row"><button type="button" class="btn green" data-act="closeModal">Done</button></div></div>';
  }
  function open() { modal(listHTML()); }
  ACT.openCrew = function () { pop(); open(); };                          // for a button anywhere: data-act="openCrew"
  ACT.crEdit = function (el) { var id = el.dataset.arg; pop(); Avatar.open(id === 'own' ? { kind: 'own' } : { kind: 'crew', id: id }, { onDone: open }); };
  ACT.crAdd = function () { pop(); Avatar.open({ kind: 'new' }, { onDone: open }); };
  ACT.crRemove = function (el) {
    var p = person(el.dataset.arg); if (!p) return;
    modal('<h2>Remove ' + esc(p.name) + '?</h2><div class="cr-rm">' + faceHTML(p, 96) + '</div><p style="text-align:center">This deletes ' + esc(p.name) + '’s look and kit from this device. Nothing else changes.</p>' +
      '<div class="row"><button type="button" class="btn" data-act="crKeep">Keep</button><button type="button" class="btn pink" data-act="crRemoveYes" data-arg="' + esc(p.id) + '">Remove</button></div>');
  };
  ACT.crKeep = function () { pop(); open(); };
  ACT.crRemoveYes = function (el) { People.removeMember(el.dataset.arg); if (typeof persist === 'function') persist(); pop(); open(); };
  // ---------- "Who is playing?" ----------
  var CH = null;                                 // { opts, cb } while the pop-up is open
  function chooseHTML(o) {
    var ex = Array.isArray(o.exclude) ? o.exclude : [], room = People.crew().length < People.MAX_CREW;
    var list = everyone().filter(function (p) { return ex.indexOf(p.id) < 0; }).map(function (p) {
      var nm = p.id === 'own' && (!p.name || p.name === 'Champ') ? 'You' : p.name;
      return '<button type="button" class="cr-pick" data-act="crPick" data-arg="' + esc(p.id) + '">' + faceHTML(p, 76) + '<b>' + esc(nm) + '</b><span class="cr-num">' + esc(p.jersey) + '</span></button>';
    }).join('');
    return '<div class="cr"><h2>' + esc(o.title || 'Who is playing?') + '</h2><div class="cr-picks">' + list +
      (room ? '<button type="button" class="cr-pick cr-add" data-act="crPickNew"><span class="cr-plus" aria-hidden="true">+</span><b>Someone new</b></button>' : '') +
      '<button type="button" class="cr-pick cr-guest" data-act="crGuest"><span class="cr-plus" aria-hidden="true">?</span><b>Guest</b></button></div>' +
      '<div class="row"><button type="button" class="btn" data-act="crBack">Back</button></div></div>';
  }
  function choose(opts, cb) {
    CH = { opts: opts || {}, cb: typeof cb === 'function' ? cb : function () {} };
    var me = CH;
    modal(chooseHTML(CH.opts), function () { if (CH === me) { CH = null; if (me.opts.onCancel) me.opts.onCancel(); } });   // closed some other way = Back
  }
  function picked(p) { var c = CH; if (!c) return; CH = null; closeModal(); c.cb(p); }
  ACT.crPick = function (el) { pop(); picked(person(el.dataset.arg)); };
  ACT.crGuest = function () { pop(); picked(null); };
  ACT.crBack = function () { pop(); closeModal(); };
  ACT.crPickNew = function () {
    var c = CH; if (!c) return; CH = null; pop();
    Avatar.open({ kind: 'new' }, { onDone: function (m) { if (m && m.id) c.cb(person(m.id)); else choose(c.opts, c.cb); } });
  };

  return { open: open, choose: choose, person: person, faceHTML: faceHTML, forget: forget, everyone: everyone };
})();
