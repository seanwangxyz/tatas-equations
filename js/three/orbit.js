// Look around the table, and take a photo.
//
// Orbit: an offset on top of the fitted "seat" camera (table.js fitCamera -> base.pos / base.look). It swings the
// camera around base.look: yaw (around the table, up to about +-150 degrees), elevation (never below ~18 degrees
// over the table, never past straight down) and distance (zoom). The seat itself is never changed, so a refit
// (resize, creature change) keeps working and the offset just rides on the new seat.
// Nothing here moves by itself: the view only changes while a finger / the mouse is moving it, or during the
// short ease back to the seat (about half a second) that the "Back to my seat" button and a new shake start.
//
// createOrbit({ allowed() -> bool, changed() }) ->
//   { apply(pos, look), step(now) -> bool, away(), dragging(), begin(), rotate(fx, fy), zoomBy(f), end(), reset(sec), snap() }
// createOrbitUI({ seat(), photo() }) -> { mount(host), update(away, photoOn), flash() }
// photoCanvas(glCanvas) -> 2D canvas with the caption strip; savePhoto(canvas2d) -> 'download' | 'share' | 'view' | ''
import * as THREE from 'three';

var YAW_MAX = 150 * Math.PI / 180;
var EL_MIN = 18 * Math.PI / 180, EL_MAX = 84 * Math.PI / 180;
var ZOOM_MIN = 0.7, ZOOM_MAX = 1.35;
var EPS = 0.004;
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
// lowest view for a given swing: a little higher from behind, where the opponent stands close to the far edge
function elMin(yaw) { return EL_MIN + 12 * Math.PI / 180 * Math.max(0, -Math.cos(yaw)); }
function ease(x) { x = clamp(x, 0, 1); return x * x * x * (x * (6 * x - 15) + 10); } // smootherstep

export function createOrbit(c) {
  var o = { yaw: 0, pitch: 0, zoom: 1 }, back = null, drag = false, v = new THREE.Vector3(), seatEl = 1;
  function isAway() { return Math.abs(o.yaw) > EPS || Math.abs(o.pitch) > EPS || Math.abs(o.zoom - 1) > EPS; }
  function changed() { if (c.changed) c.changed(); }
  var api = {
    // pos / look already hold the seat (plus any small cue offsets); swing pos around look
    apply: function (pos, look) {
      v.copy(pos).sub(look);
      var r = v.length(); if (r < 1e-6) return;
      var el0 = Math.asin(clamp(v.y / r, -1, 1)); seatEl = el0;
      if (!isAway() && !back) return;
      var yaw0 = Math.atan2(v.x, v.z);
      // the pitch offset is relative to the seat, but the result is kept inside the safe band
      var el = clamp(el0 + o.pitch, Math.min(elMin(o.yaw), el0), Math.max(EL_MAX, el0)), yw = yaw0 + o.yaw, rr = r * o.zoom;
      // Stay inside the venue: never further out sideways than the seat is (the stands start not far beyond it),
      // except toward the front, where there is room to back away. Lowering the view brings the camera closer.
      var cy = Math.max(0, Math.cos(o.yaw)), hcap = r * Math.cos(el0) * (0.92 + (ZOOM_MAX - 0.92) * cy * cy);
      if (rr * Math.cos(el) > hcap) rr = hcap / Math.cos(el);
      pos.set(look.x + Math.sin(yw) * Math.cos(el) * rr, look.y + Math.sin(el) * rr, look.z + Math.cos(yw) * Math.cos(el) * rr);
    },
    // the ease home; returns true when the view changed this frame
    step: function (now) {
      if (!back) return false;
      var k = (now - back.t0) / 1000 / back.dur, e = ease(k);
      o.yaw = back.from.yaw * (1 - e); o.pitch = back.from.pitch * (1 - e); o.zoom = 1 + (back.from.zoom - 1) * (1 - e);
      if (k >= 1) { back = null; o.yaw = 0; o.pitch = 0; o.zoom = 1; }
      return true;
    },
    away: function () { return isAway(); },
    dragging: function () { return drag; },
    easing: function () { return !!back; },
    begin: function () { if (!c.allowed()) return false; back = null; drag = true; return true; },
    // fx, fy: how far the pointer moved, as a fraction of the canvas width / height
    rotate: function (fx, fy) {
      if (!drag) return;
      o.yaw = clamp(o.yaw - fx * Math.PI * 1.1, -YAW_MAX, YAW_MAX);
      o.pitch = clamp(o.pitch + fy * Math.PI * 0.55, Math.min(0, elMin(o.yaw) - seatEl), Math.max(0, EL_MAX - seatEl)); // no dead zone past the limits
      changed();
    },
    zoomBy: function (f) {
      if (!(f > 0) || !isFinite(f)) return;
      if (!drag && !c.allowed()) return;
      back = null; o.zoom = clamp(o.zoom * f, ZOOM_MIN, ZOOM_MAX); changed();
    },
    end: function () { drag = false; },
    // ease back to the seat in `sec` seconds (default 0.5)
    reset: function (sec) {
      drag = false;
      if (!isAway()) { if (back) return; o.yaw = 0; o.pitch = 0; o.zoom = 1; return; }
      back = { t0: performance.now(), dur: sec || 0.5, from: { yaw: o.yaw, pitch: o.pitch, zoom: o.zoom } }; changed();
    },
    snap: function () { drag = false; back = null; if (isAway()) { o.yaw = 0; o.pitch = 0; o.zoom = 1; changed(); } },
    state: function () { return { yaw: o.yaw, pitch: o.pitch, zoom: o.zoom, dragging: drag, easing: !!back }; }
  };
  return api;
}

// ----- The two small buttons over the 3D picture -----
var SEAT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11.5 12 5l7 6.5M7 10v8.5h10V10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var CAM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3.2l1.6-2.3h6.4l1.6 2.3H20v10H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="13.3" r="3.3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
export function createOrbitUI(h) {
  var box = null, seatB = null, camB = null, fl = null, st = { away: null, photo: null };
  function build() {
    box = document.createElement('div'); box.className = 'orbit-ui';
    seatB = document.createElement('button'); seatB.type = 'button'; seatB.className = 'btn small ghost orbit-seat';
    seatB.innerHTML = SEAT_SVG + '<span class="lbl">Back to my seat</span>'; seatB.setAttribute('aria-label', 'Back to my seat');
    camB = document.createElement('button'); camB.type = 'button'; camB.className = 'btn small ghost orbit-photo';
    camB.innerHTML = CAM_SVG; camB.setAttribute('aria-label', 'Take a photo'); camB.title = 'Take a photo';
    seatB.addEventListener('click', function (e) { e.stopPropagation(); h.seat(); });
    camB.addEventListener('click', function (e) { e.stopPropagation(); h.photo(); });
    box.appendChild(seatB); box.appendChild(camB);
    fl = document.createElement('div'); fl.className = 'orbit-flash';
    st = { away: null, photo: null };
  }
  return {
    mount: function (host) {
      if (!box) build();
      if (box.parentNode !== host) { host.appendChild(box); host.appendChild(fl); }
    },
    update: function (away, photoOn) {
      if (!box) return;
      if (st.away !== away) { st.away = away; seatB.classList.toggle('on', !!away); seatB.tabIndex = away ? 0 : -1; seatB.setAttribute('aria-hidden', away ? 'false' : 'true'); }
      if (st.photo !== photoOn) { st.photo = photoOn; camB.classList.toggle('on', !!photoOn); camB.tabIndex = photoOn ? 0 : -1; }
    },
    // a short, soft white flash over the picture (one-shot)
    flash: function () {
      if (!fl) return;
      fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    }
  };
}

// ----- Photo -----
// Copy the WebGL canvas (call right after rendering, in the same tick) and add a caption strip at the bottom.
export function photoCanvas(src) {
  var w = src.width, h = src.height; if (!w || !h) return null;
  var strip = Math.round(Math.max(30, Math.min(90, h * 0.075)));
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h + strip;
  var g = cv.getContext('2d');
  g.fillStyle = '#0c1630'; g.fillRect(0, 0, w, h + strip);
  g.drawImage(src, 0, 0, w, h);
  // the strip: a dark band with the name in the game's display font, a thin gold line on top
  var gr = g.createLinearGradient(0, h, 0, h + strip); gr.addColorStop(0, '#1b2a55'); gr.addColorStop(1, '#0c1630');
  g.fillStyle = gr; g.fillRect(0, h, w, strip);
  g.fillStyle = '#ffd43b'; g.fillRect(0, h, w, Math.max(2, Math.round(strip * 0.06)));
  var fs = Math.round(strip * 0.52);
  g.font = fs + 'px "Lilita One", "Trebuchet MS", "Segoe UI", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText("Tata's Equations", w / 2 + 1.5, h + strip * 0.55 + 2);
  g.fillStyle = '#ffffff'; g.fillText("Tata's Equations", w / 2, h + strip * 0.55);
  return cv;
}
var NAME = 'tatas-equations-photo.png';
function isIOS() { var n = navigator; return /iPad|iPhone|iPod/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1); }
function dataToBlob(url) {
  var b = atob(url.split(',')[1]), a = new Uint8Array(b.length);
  for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return new Blob([a], { type: 'image/png' });
}
// Everything up to share() / click() happens synchronously, inside the tap, so iPad Safari still counts it as the
// user's own action. Returns how the picture was handed over.
export function savePhoto(cv) {
  var url = cv.toDataURL('image/png'), blob = dataToBlob(url);
  if (isIOS()) {
    var file = null; try { file = new File([blob], NAME, { type: 'image/png' }); } catch (e) {}
    if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Tata's Equations" }).catch(function (e) { if (!e || e.name !== 'AbortError') viewPhoto(url); });
      return 'share';
    }
    viewPhoto(url); return 'view';
  }
  try {
    var a = document.createElement('a'), obj = URL.createObjectURL(blob);
    a.href = obj; a.download = NAME; a.style.display = 'none'; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(obj); }, 1500);
    return 'download';
  } catch (e) { viewPhoto(url); return 'view'; }
}
// Fallback: show the picture in a pop-over; press and hold (iPad) or right-click to save it.
function viewPhoto(url) {
  var old = document.querySelector('.orbit-view'); if (old) old.remove();
  var d = document.createElement('div'); d.className = 'orbit-view';
  d.innerHTML = '<div class="ov-card"><img alt="Your photo of the game" src="' + url + '"><p>Press and hold the picture to save it.</p><button type="button" class="btn small">Done</button></div>';
  d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('button')) { e.stopPropagation(); d.remove(); } });
  document.body.appendChild(d);
}
