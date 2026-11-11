'use strict';
// ======================= INPUT: taps and drag-and-drop =======================
var drag = null, suppressClick = false;
document.addEventListener('click', function (e) {
  if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
  var a = e.target.closest('[data-act]');
  if (!a) {
    var cube = e.target.closest('#game .z-res .cube, #game .zone .cube.locked');
    if (cube) ACT.cubeTap(cube);
    return;
  }
  var f = ACT[a.dataset.act];
  if (f) { Snd.init(); f(a, e); }
});
document.addEventListener('pointerdown', function (e) {
  var cube = e.target.closest('#game .z-res .cube');
  if (!cube || !G || !humanTurn()) return;
  drag = { id: +cube.dataset.id, x: e.clientX, y: e.clientY, on: false, el: cube };
});
document.addEventListener('pointermove', function (e) {
  if (!drag) return;
  if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) {
    drag.on = true; var gh = $('#ghost'); gh.innerHTML = drag.el.outerHTML; gh.style.display = 'block';
    G.selected = drag.id; document.querySelectorAll('#game .zone[data-zone]').forEach(function (z) { if (['required', 'permitted', 'forbidden'].indexOf(z.dataset.zone) >= 0 && canMoveTo(z.dataset.zone)) z.classList.add('target'); });
    drag.el.style.opacity = '0.3';
  }
  if (drag.on) { var g = $('#ghost'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; e.preventDefault(); }
}, { passive: false });
document.addEventListener('pointerup', function (e) {
  if (!drag) return;
  var d = drag; drag = null;
  if (!d.on) return;
  suppressClick = true; setTimeout(function () { suppressClick = false; }, 50);
  $('#ghost').style.display = 'none';
  var t = document.elementFromPoint(e.clientX, e.clientY), z = t && t.closest('[data-zone]');
  if (z && ['required', 'permitted', 'forbidden'].indexOf(z.dataset.zone) >= 0) doMove(d.id, z.dataset.zone);
  else { G.selected = null; renderGame(); }
});
document.addEventListener('pointercancel', function () { if (drag && drag.on) { $('#ghost').style.display = 'none'; G.selected = null; renderGame(); } drag = null; });

// ----- 3D table hooks -----
T3.handlers = {
  canDrag: function (id) { return humanTurn() && G.cubes[id].zone === 'resources' && !G.cubes[id].locked; },
  dragStart: function (id) { G.selected = id; },
  cubeTap: function (id) {
    var c = G && G.cubes[id]; if (!c) return;
    if (c.zone === 'resources' || c.locked) { ACT.cubeTap({ dataset: { id: String(id) } }); return; }
    if (G.selected != null && humanTurn() && ['required', 'permitted', 'forbidden'].indexOf(c.zone) >= 0) doMove(G.selected, c.zone);
  },
  zoneTap: function (z) { if (G && G.selected != null && humanTurn()) doMove(G.selected, z); },
  drop: function (id, z) {
    if (G && z && ['required', 'permitted', 'forbidden'].indexOf(z) >= 0 && humanTurn()) { G.selected = id; doMove(id, z); }
    if (G && G.cubes[id].zone === 'resources') { G.selected = null; renderGame(); }
  },
  targetZones: function () { if (!G || G.selected == null || G.phase !== 'move') return []; return ['required', 'permitted', 'forbidden'].filter(canMoveTo); }
};

if (window.Social) Social.moodHook = function (mood) { creatureMood(mood); };

// ======================= START =======================
// One-time: older saves switch to the new Stadium setting (it can be changed back in the Trophy Room).
if (!S.cos.stadiumIntro) { S.cos.mat = 'stadium'; S.cos.stadiumIntro = true; persist(); }
FX.init();
applyOppNames();
applyCosmetics();
$('#splashPip').innerHTML = pipSVG('happy');
window.TataGame = { S: function () { return S; }, G: function () { return G; }, render: function () { renderGame(); }, move: function (id, z) { if (G) { G.selected = id; doMove(id, z); } } }; // for testing in the browser console
