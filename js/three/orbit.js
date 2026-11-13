// Look around the table, and take a photo.
//
// Orbit: an offset on top of the fitted "seat" camera (table.js fitCamera -> base.pos / base.look). It swings the
// camera around the look-at point: yaw (around the table, up to about +-150 degrees), elevation (never below ~18 degrees
// over the table, never past straight down), distance (zoom), and a pan of the look-at point itself, so the player can
// zoom right up to the stands and look at the crowd. The seat itself is never changed, so a refit (resize, creature
// change) keeps working and the offset just rides on the new seat.
// Nothing here moves by itself: the view only changes while a finger / the mouse is moving it, or during the
// short ease back to the seat (about half a second) that the "Back to my seat" button and a new shake start.
//
// Limits: the look-at point stays inside c.bounds() (the venue's box) and above c.floor; the camera is kept out of
// solid things by c.clip(look, pos) (table.js casts a ray from the look-at point to the camera and stops it short of the
// first hit: stands, table, cubes, creature, kid, floor). Distance: from MIN_R world units to 1.35x the seat. The lowest
// view is ~18 degrees over the table and ~4 degrees once the look-at point is off the table or the view is zoomed in.
//
// createOrbit({ allowed() -> bool, changed(), bounds() -> Box3|null, table() -> {hw, hd, cz}, clip(look, pos), floor }) ->
//   { apply(pos, look), step(now) -> bool, away(), dragging(), begin(), rotate(fx, fy), zoomBy(f, at?), panBy(fx, fy, aspect, fov),
//     end(), reset(sec), snap(), look(), state() }
// createOrbitUI({ seat(), photo() }) -> { mount(host), update(away, photoOn), flash() }
// photoCanvas(glCanvas) -> 2D canvas with the caption strip; savePhoto(canvas2d) -> 'download' | 'share' | 'view' | ''
import * as THREE from 'three';

var YAW_MAX = 150 * Math.PI / 180;
var EL_MIN = 18 * Math.PI / 180, EL_MAX = 84 * Math.PI / 180, EL_LOW = 4 * Math.PI / 180;
var ZOOM_MAX = 1.35, MIN_R = 2.2;
var EPS = 0.004;
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
// lowest view for a given swing: a little higher from behind, where the opponent stands close to the far edge
function elMin(yaw) { return EL_MIN + 12 * Math.PI / 180 * Math.max(0, -Math.cos(yaw)); }
function ease(x) { x = clamp(x, 0, 1); return x * x * x * (x * (6 * x - 15) + 10); } // smootherstep

export function createOrbit(c) {
  var o = { yaw: 0, pitch: 0, zoom: 1, pan: new THREE.Vector3() }, back = null, drag = false, v = new THREE.Vector3(), seatEl = 1;
  var last = { r: 30, look: new THREE.Vector3(), pos: new THREE.Vector3(), ok: false, low: EL_MIN };
  var sig = '', clipK = 1, tq = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
  function zMin() { return Math.min(1, MIN_R / Math.max(MIN_R, last.r)); }
  function isAway() { return Math.abs(o.yaw) > EPS || Math.abs(o.pitch) > EPS || Math.abs(o.zoom - 1) > EPS || o.pan.lengthSq() > EPS * EPS; }
  function changed() { if (c.changed) c.changed(); }
  // how far the look-at point is off the table (0 on it, 1 from ~3 units beyond its edge or below its top)
  function outside(look) {
    var b = c.table ? c.table() : null; if (!b) return 0;
    var dx = Math.max(0, Math.abs(look.x) - b.hw), dz = Math.max(0, Math.abs(look.z - b.cz) - b.hd), dy = Math.max(0, -look.y);
    return clamp(Math.max(Math.hypot(dx, dz), dy) / 3, 0, 1);
  }
  function lowest(yaw, look) { var f = Math.max(outside(look), clamp((0.45 - o.zoom) / 0.3, 0, 1)), m = elMin(yaw); return m + (EL_LOW - m) * f; }
  // keep the panned look-at point inside the venue (writes the clamped pan back, so the state never drifts outside)
  function clampLook(base) {
    tq.copy(base).add(o.pan);
    var b = c.bounds ? c.bounds() : null;
    if (b) { tq.x = clamp(tq.x, b.min.x, b.max.x); tq.y = clamp(tq.y, b.min.y, b.max.y); tq.z = clamp(tq.z, b.min.z, b.max.z); }
    if (c.floor != null) tq.y = Math.max(tq.y, c.floor + 0.3);
    o.pan.copy(tq).sub(base);
    return tq;
  }
  var api = {
    // pos / look already hold the seat (plus any small cue offsets); move look by the pan, swing pos around it
    apply: function (pos, look) {
      v.copy(pos).sub(look);
      var r = v.length(); if (r < 1e-6) return;
      var el0 = Math.asin(clamp(v.y / r, -1, 1)); seatEl = el0; last.r = r;
      if (!isAway() && !back) { last.ok = false; last.look.copy(look); last.pos.copy(pos); return; }
      look.copy(clampLook(look));
      var yaw0 = Math.atan2(v.x, v.z);
      // the pitch offset is relative to the seat, but the result is kept inside the safe band
      var lo = lowest(o.yaw, look); last.low = lo;
      var el = clamp(el0 + o.pitch, Math.min(lo, el0), Math.max(EL_MAX, el0)), yw = yaw0 + o.yaw, rr = r * clamp(o.zoom, zMin(), ZOOM_MAX);
      // Backing away: never further out sideways than the seat is (the stands start not far beyond it), except toward
      // the front, where there is room to back away. Lowering the view brings the camera closer.
      var cy = Math.max(0, Math.cos(o.yaw)), hcap = r * Math.cos(el0) * (0.92 + (ZOOM_MAX - 0.92) * cy * cy);
      if (rr * Math.cos(el) > hcap) rr = hcap / Math.cos(el);
      pos.set(look.x + Math.sin(yw) * Math.cos(el) * rr, look.y + Math.sin(el) * rr, look.z + Math.cos(yw) * Math.cos(el) * rr);
      // never inside the stands, the table, the creature or under the floor (the ray is cast only when the view changed)
      var s = o.yaw.toFixed(4) + ',' + el.toFixed(4) + ',' + rr.toFixed(3) + ',' + look.x.toFixed(3) + ',' + look.y.toFixed(3) + ',' + look.z.toFixed(3);
      if (c.clip) {
        if (s !== sig) { sig = s; c.clip(look, pos); clipK = pos.distanceTo(look) / Math.max(1e-6, rr); }
        else if (clipK < 0.9999) pos.lerpVectors(look, pos, clipK);
      }
      last.look.copy(look); last.pos.copy(pos); last.ok = true;
    },
    // the ease home; returns true when the view changed this frame
    step: function (now) {
      if (!back) return false;
      var k = (now - back.t0) / 1000 / back.dur, e = ease(k);
      o.yaw = back.from.yaw * (1 - e); o.pitch = back.from.pitch * (1 - e); o.zoom = 1 + (back.from.zoom - 1) * (1 - e); o.pan.copy(back.from.pan).multiplyScalar(1 - e);
      if (k >= 1) { back = null; o.yaw = 0; o.pitch = 0; o.zoom = 1; o.pan.set(0, 0, 0); }
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
      var lo = last.ok ? Math.min(last.low, elMin(o.yaw)) : elMin(o.yaw);
      o.pitch = clamp(o.pitch + fy * Math.PI * 0.55, Math.min(0, lo - seatEl), Math.max(0, EL_MAX - seatEl)); // no dead zone past the limits
      changed();
    },
    // f < 1 zooms in. at (a world point, optional): zoom toward it; the point under the mouse / between the fingers
    // stays put, so the player can zoom straight at the stands. Zooming back out eases the look-at point home.
    zoomBy: function (f, at) {
      if (!(f > 0) || !isFinite(f)) return;
      if (!drag && !c.allowed()) return;
      back = null;
      var z0 = o.zoom, z1 = clamp(z0 * f, zMin(), ZOOM_MAX), k = z1 / z0;
      if (k < 1 && at) {
        var L = last.look;
        tq.copy(L).sub(at).multiplyScalar(k).add(at).sub(L); // look' = at + (look - at) * k, as a change of the pan
        o.pan.add(tq);
      } else if (k > 1 && z0 < 1) o.pan.multiplyScalar(clamp((1 - Math.min(1, z1)) / (1 - z0), 0, 1));
      o.zoom = z1; changed();
    },
    // slide the look-at point in the picture plane (right-drag / shift-drag): fx, fy as fractions of the canvas size
    panBy: function (fx, fy, aspect, fov) {
      if (!drag) return;
      var r = last.pos.distanceTo(last.look) || last.r, h = 2 * r * Math.tan((fov || 0.66) / 2);
      fwd.copy(last.look).sub(last.pos).normalize(); if (fwd.lengthSq() < 0.5) fwd.set(0, -Math.sin(seatEl), -Math.cos(seatEl));
      right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize();
      up.crossVectors(right, fwd).normalize();
      o.pan.addScaledVector(right, -fx * h * (aspect || 1.5)).addScaledVector(up, fy * h);
      changed();
    },
    end: function () { drag = false; },
    // ease back to the seat in `sec` seconds (default 0.5)
    reset: function (sec) {
      drag = false;
      if (!isAway()) { if (back) return; o.yaw = 0; o.pitch = 0; o.zoom = 1; o.pan.set(0, 0, 0); return; }
      back = { t0: performance.now(), dur: sec || 0.5, from: { yaw: o.yaw, pitch: o.pitch, zoom: o.zoom, pan: o.pan.clone() } }; changed();
    },
    snap: function () { drag = false; back = null; if (isAway()) { o.yaw = 0; o.pitch = 0; o.zoom = 1; o.pan.set(0, 0, 0); changed(); } },
    // the drawn look-at point while away from the seat (null at the seat)
    look: function () { return last.ok ? last.look : null; },
    state: function () { return { yaw: o.yaw, pitch: o.pitch, zoom: o.zoom, pan: o.pan.toArray(), dragging: drag, easing: !!back, dist: last.ok ? last.pos.distanceTo(last.look) : last.r }; }
  };
  return api;
}

// ----- The two small buttons over the 3D picture -----
var SEAT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11.5 12 5l7 6.5M7 10v8.5h10V10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var CAM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3.2l1.6-2.3h6.4l1.6 2.3H20v10H4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="13.3" r="3.3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
export function createOrbitUI(h) {
  var box = null, seatB = null, camB = null, fl = null, menu = null, st = { away: null, photo: null };
  function build() {
    box = document.createElement('div'); box.className = 'orbit-ui';
    seatB = document.createElement('button'); seatB.type = 'button'; seatB.className = 'btn small ghost orbit-seat';
    seatB.innerHTML = SEAT_SVG + '<span class="lbl">Back to my seat</span>'; seatB.setAttribute('aria-label', 'Back to my seat');
    camB = document.createElement('button'); camB.type = 'button'; camB.className = 'btn small ghost orbit-photo';
    camB.innerHTML = CAM_SVG; camB.setAttribute('aria-label', 'Take a photo'); camB.title = 'Take a photo';
    seatB.addEventListener('click', function (e) { e.stopPropagation(); h.seat(); });
    // the camera button opens a small row of frames; picking one takes the photo in that style
    menu = document.createElement('div'); menu.className = 'orbit-styles'; menu.setAttribute('role', 'menu');
    STYLES.forEach(function (st2) {
      var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'btn small ghost os-' + st2.id; b2.textContent = st2.label; b2.setAttribute('role', 'menuitem');
      b2.addEventListener('click', function (e) { e.stopPropagation(); photoStyle = st2.id; menu.classList.remove('on'); h.photo(); });
      menu.appendChild(b2);
    });
    camB.addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('on'); });
    box.appendChild(menu); box.appendChild(seatB); box.appendChild(camB);
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
      if (st.photo !== photoOn) { st.photo = photoOn; camB.classList.toggle('on', !!photoOn); camB.tabIndex = photoOn ? 0 : -1; if (!photoOn) menu.classList.remove('on'); }
    },
    // a short, soft white flash over the picture (one-shot)
    flash: function () {
      if (!fl) return;
      fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    }
  };
}

// ----- Photo -----
var STYLES = [{ id: 'classic', label: 'Classic' }, { id: 'polaroid', label: 'Snapshot' }, { id: 'poster', label: 'Poster' }, { id: 'sunny', label: 'Sunny' }];
var photoStyle = 'classic';
export function setPhotoStyle(id) { if (STYLES.some(function (s) { return s.id === id; })) photoStyle = id; return photoStyle; }
var DISPLAY = '"Lilita One", "Trebuchet MS", "Segoe UI", sans-serif';
function dateText() { try { return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return new Date().toDateString(); } }
function scoreText() { // "CHAMP 2 • SNOOZY 1" from the match in progress, or ''
  try { var G = window.G; if (!G || !G.players || G.players.length < 2) return ''; return G.players.map(function (p) { return String(p.name || '').toUpperCase() + ' ' + (p.score || 0); }).join('  •  '); } catch (e) { return ''; }
}
function fitFont(g, text, size, maxW) { for (;;) { g.font = size + 'px ' + DISPLAY; if (g.measureText(text).width <= maxW || size < 10) return size; size -= 2; } }
// Copy the WebGL canvas (call right after rendering, in the same tick) and frame it in the chosen style:
// classic (a caption strip), snapshot (a white instant-photo frame with the date), poster (title, score and date),
// sunny (a warm golden grade with a soft vignette: on the saved photo only, never on the live game).
export function photoCanvas(src, style) {
  var w = src.width, h = src.height; if (!w || !h) return null;
  style = style || photoStyle;
  var cv = document.createElement('canvas'), g = cv.getContext('2d'), u = Math.max(w, h) / 1000;
  if (style === 'polaroid') {
    var m = Math.round(28 * u), mb = Math.round(110 * u); cv.width = w + 2 * m; cv.height = h + m + mb;
    g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(src, m, m, w, h);
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.strokeRect(m, m, w, h);
    g.fillStyle = '#2b2f3a'; g.textAlign = 'left'; g.textBaseline = 'middle'; fitFont(g, "Tata's Equations", Math.round(44 * u), w * 0.55); g.fillText("Tata's Equations", m, h + m + mb * 0.48);
    g.textAlign = 'right'; g.fillStyle = '#6b7080'; fitFont(g, dateText(), Math.round(30 * u), w * 0.4); g.fillText(dateText(), m + w, h + m + mb * 0.5);
    return cv;
  }
  if (style === 'poster') {
    var bt = Math.round(120 * u), bb = Math.round(150 * u), side = Math.round(24 * u); cv.width = w + 2 * side; cv.height = h + bt + bb;
    var gr = g.createLinearGradient(0, 0, 0, cv.height); gr.addColorStop(0, '#0f2a66'); gr.addColorStop(1, '#060d24'); g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(src, side, bt, w, h); g.strokeStyle = '#ffd43b'; g.lineWidth = Math.max(3, 5 * u); g.strokeRect(side, bt, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd43b'; fitFont(g, "TATA'S EQUATIONS", Math.round(70 * u), cv.width * 0.9); g.fillText("TATA'S EQUATIONS", cv.width / 2, bt * 0.52);
    var sc = scoreText() || 'MATCH DAY';
    g.fillStyle = '#ffffff'; fitFont(g, sc, Math.round(56 * u), cv.width * 0.9); g.fillText(sc, cv.width / 2, bt + h + bb * 0.38);
    g.fillStyle = '#8fd3ff'; fitFont(g, dateText(), Math.round(32 * u), cv.width * 0.8); g.fillText(dateText(), cv.width / 2, bt + h + bb * 0.75);
    return cv;
  }
  if (style === 'sunny') {
    var bd = Math.round(18 * u); cv.width = w + 2 * bd; cv.height = h + 2 * bd;
    g.fillStyle = '#fffaf0'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(src, bd, bd, w, h);
    g.save(); g.beginPath(); g.rect(bd, bd, w, h); g.clip();
    g.globalCompositeOperation = 'soft-light'; var wg = g.createLinearGradient(bd, bd, bd + w, bd + h); wg.addColorStop(0, 'rgba(255,190,110,.75)'); wg.addColorStop(1, 'rgba(255,140,90,.45)'); g.fillStyle = wg; g.fillRect(bd, bd, w, h);
    g.globalCompositeOperation = 'source-over'; var vg = g.createRadialGradient(bd + w / 2, bd + h / 2, Math.min(w, h) * 0.35, bd + w / 2, bd + h / 2, Math.max(w, h) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,20,0,.35)'); g.fillStyle = vg; g.fillRect(bd, bd, w, h);
    g.restore();
    g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(255,255,255,.9)'; fitFont(g, "Tata's Equations", Math.round(30 * u), w * 0.5); g.fillText("Tata's Equations", bd + w - 14 * u, bd + h - 14 * u);
    return cv;
  }
  var strip = Math.round(Math.max(30, Math.min(90, h * 0.075)));
  cv.width = w; cv.height = h + strip;
  g.fillStyle = '#0c1630'; g.fillRect(0, 0, w, h + strip);
  g.drawImage(src, 0, 0, w, h);
  // the strip: a dark band with the name in the game's display font, a thin gold line on top
  var gr2 = g.createLinearGradient(0, h, 0, h + strip); gr2.addColorStop(0, '#1b2a55'); gr2.addColorStop(1, '#0c1630');
  g.fillStyle = gr2; g.fillRect(0, h, w, strip);
  g.fillStyle = '#ffd43b'; g.fillRect(0, h, w, Math.max(2, Math.round(strip * 0.06)));
  var fs = Math.round(strip * 0.52);
  g.font = fs + 'px ' + DISPLAY;
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
