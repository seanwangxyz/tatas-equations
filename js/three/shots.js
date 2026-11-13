// Camera direction: one-shot moves, T3.shot(name, opts). Each one is worked out ONCE when it starts (no tracking, no
// sway), plays, and ends exactly on the fitted seat view (table.js fitCamera: the blend weight goes back to 0).
// A tap skips (quick ease home). The table never starts a shot during the pour, while a cube is held, or while the
// player is looking around (orbit). With calm / reduced motion every move becomes a cut: the framing appears, holds,
// and cuts back; the long establishing / crane moves are skipped.
//
//   'goal'      a gentle push-in toward the Goal row when a Goal is set (the cubes being read stay sharp and central)
//   'challenge' a quick two-shot: the kid and the creature, side by side, the table between them
//   'win'       a hero shot of the kid (the winner), from over the table, head on the upper third
//   'lose'      the creature celebrating, with room to dance, framed on a third
//   'kickoff'   (hook) an establishing move: from high over the near corner, down and round onto the seat (2.8 s)
//   'final'     (hook) a slow crane up and back from the seat at the final whistle, a pause, then home (4.6 s)
//   'hero'      (hook) the winner of a shake: opts.who = 'kid' | 'opp'
//
// createShots(c) where c = {
//   camera, base() -> {pos, look} (the fitted view), creature() -> {head: Vector3, height} | null,
//   board() -> {center, normal, w, h} | null, goalZone() -> {center, w, d} | null, blocked() -> bool }
// returns { start(name, opts) -> bool, step(now) -> bool (camera changed), apply(pos, look), skip(), cancel(), active(), weight() }
import * as THREE from 'three';
import { calm } from './lighting.js';

// in / hold / out in seconds. 'from': the shot starts at its framing (w = 1) and only travels home.
var SPEC = {
  goal: { in: 0.7, hold: 0.9, out: 0.8 },
  challenge: { in: 0.3, hold: 0.8, out: 0.55 },
  win: { in: 0.6, hold: 1.3, out: 0.8 },
  lose: { in: 0.5, hold: 0.9, out: 0.6 },
  hero: { in: 0.5, hold: 1.0, out: 0.7 },
  kickoff: { in: 0, hold: 0.25, out: 2.8, from: true, long: true },
  final: { in: 2.6, hold: 1.0, out: 1.4, long: true }
};
var SKIP_OUT = 0.28;
var PRIORITY = { goal: 1, challenge: 2, hero: 2, win: 3, lose: 3, kickoff: 4, final: 4 };
function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (6 * x - 15) + 10); } // smootherstep: starts and stops gently
export var SHOT = { w: 0, name: null, focus: null }; // read by postfx.js (a soft background blur on high quality)

export function createShots(c) {
  var cur = null, lastEnd = { name: '', t: 0 }, w = 0;

  function fovT() { return Math.tan(c.camera.fov * Math.PI / 360); }
  function dist(frameW, frameH) { var t = fovT(), a = c.camera.aspect || 1.5; return Math.max(frameH / 2 / t, frameW / 2 / (t * a)); }
  function kid() { try { var f = window.T3 && window.T3.anchor && window.T3.anchor('kid'); var p = f && f(); return p ? p.clone() : null; } catch (e) { return null; } }
  // camera right vector for a view from pos to look
  function rightOf(pos, look) { return new THREE.Vector3().subVectors(look, pos).cross(THREE.Object3D.DEFAULT_UP).normalize(); }
  // move the look point so the subject sits on a third of the frame (side: -1 left third, +1 right third)
  function thirds(pos, look, side, d) { var r = rightOf(pos, look), wHalf = d * fovT() * (c.camera.aspect || 1.5); look.addScaledVector(r, -side * wHalf / 3); return look; }
  function framing(name, opts) {
    var b = c.base(); if (!b) return null;
    var toCam = new THREE.Vector3().subVectors(b.pos, b.look), full = toCam.length(); toCam.normalize();
    if (name === 'goal') { // push in along the seat's own line toward the Goal row: the same angle, 20% closer
      var gz = c.goalZone(); if (!gz) return null;
      var look = b.look.clone().lerp(gz.center, 0.55);
      return { pos: look.clone().addScaledVector(toCam, full * 0.8), look: look };
    }
    if (name === 'kickoff' || name === 'final') { // high and wide, swung a little to one side; the table stays the subject
      var yaw = name === 'kickoff' ? -0.55 : 0.32, up = name === 'kickoff' ? 1.6 : 1.45, far = name === 'kickoff' ? 1.25 : 1.35;
      var d2 = toCam.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw); d2.y *= up; d2.normalize();
      var lk = b.look.clone(); lk.z -= name === 'final' ? 3 : 1.5; lk.y += name === 'final' ? 2 : 0;
      return { pos: lk.clone().addScaledVector(d2, full * far), look: lk };
    }
    var cr = c.creature(), kh = kid();
    if (name === 'challenge' && cr && cr.head && kh) { // the two-shot: both heads, the table between, seen a little from the side
      var mid = cr.head.clone().lerp(kh, 0.5), span = cr.head.distanceTo(kh), h = Math.max(1.2, cr.height || 3);
      var dir = toCam.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, 1.0); dir.y = 0.5; dir.normalize();
      var dd = dist(span * 1.0 + h, span * 0.45 + h * 1.2);
      return place(mid, dir, dd, b);
    }
    if ((name === 'win' || (name === 'hero' && (!opts.who || opts.who === 'kid'))) && kh) { // the kid, from over the table, looking back at him
      var kh2 = kh.clone(); kh2.y -= 0.9;
      var back = new THREE.Vector3(0.25, 0.3, -1).normalize(); // from the far side of him (over the table), a little above
      var dk = dist(7.5, 5.6), pk = kh2.clone().addScaledVector(back, dk);
      if (pk.y < 1.6) pk.y = 1.6;
      return { pos: pk, look: thirds(pk, kh2.clone(), 1, dk) };
    }
    if (!cr || !cr.head) return null;
    // the creature: challenge = head and shoulders, hero = upper body, lose = room to dance; on a third
    var hh = Math.max(1.2, cr.height || 3), lower = { challenge: 0.2, hero: 0.3, win: 0.3, lose: 0.4 }[name] || 0.3, tall = { challenge: 1.3, hero: 1.6, win: 1.6, lose: 2.1 }[name] || 1.6;
    var lookC = cr.head.clone(); lookC.y -= hh * lower;
    var dirC = toCam.clone(); dirC.y *= 0.6; dirC.normalize();
    var f = place(lookC, dirC, dist(hh * tall * 0.9, hh * tall), b);
    thirds(f.pos, f.look, name === 'lose' ? -1 : 1, f.pos.distanceTo(f.look) * 0.6);
    return f;
  }
  // camera at `look + dir * d`, never further away than most of the seat distance, never below the table top
  function place(look, dir, d, b) {
    var full = b.pos.distanceTo(look); d = Math.min(Math.max(d, 4), full * 0.85);
    var pos = look.clone().addScaledVector(dir, d); if (pos.y < 1.6) pos.y = 1.6;
    return { pos: pos, look: look.clone() };
  }
  var api = {
    start: function (name, opts) {
      var sp = SPEC[name]; opts = opts || {};
      if (!sp || c.blocked()) return false;
      var still = calm();
      if (still && sp.long) return false; // reduced motion: no establishing or crane moves at all
      var now = performance.now();
      if (cur && (PRIORITY[name] || 0) <= (PRIORITY[cur.name] || 0)) return false;      // one at a time
      if (!cur && lastEnd.name === name && now - lastEnd.t < 2500) return false;        // not the same move again straight away
      var f = framing(name, opts); if (!f) return false;
      var from = null;
      if (cur) { from = { pos: c.camera.position.clone(), look: cur.lastLook.clone() }; } // hand over from the shot in progress without a jump
      cur = { name: name, t0: now, tin: still ? 0 : sp.in, hold: opts.hold || sp.hold, tout: still ? 0 : sp.out, fromStart: !!sp.from, pos: f.pos, look: f.look, from: from, out: null, lastLook: new THREE.Vector3(), done: opts.done };
      SHOT.name = name; SHOT.focus = f.look.clone();
      return true;
    },
    // advance; returns true when the camera pose changed this frame (including the frame it ends on)
    step: function (now) {
      if (!cur) return false;
      var t = (now - cur.t0) / 1000;
      if (cur.out) {
        var k = cur.out.dur > 0 ? (now - cur.out.t0) / 1000 / cur.out.dur : 1;
        w = cur.out.w0 * (1 - ease(k));
        if (k >= 1) { api.cancel(); return true; }
      } else if (cur.fromStart || t >= cur.tin) {
        if (t < cur.tin + cur.hold) w = 1;
        else { cur.out = { t0: now, dur: cur.tout, w0: 1 }; w = 1; }
      } else w = ease(t / cur.tin);
      SHOT.w = w;
      return true;
    },
    // blend the drawn camera (pos/look already hold the fitted view plus any small cue offsets) toward the shot
    apply: function (pos, look) {
      if (!cur) return;
      if (cur.from && !cur.out) { pos.copy(cur.from.pos); look.copy(cur.from.look); }
      pos.lerp(cur.pos, w); look.lerp(cur.look, w); cur.lastLook.copy(look);
    },
    skip: function () { if (cur && !cur.out) { cur.out = { t0: performance.now(), dur: calm() ? 0 : SKIP_OUT, w0: w }; cur.from = null; } },
    cancel: function () {
      if (!cur) return; var d = cur.done; lastEnd = { name: cur.name, t: performance.now() }; cur = null; w = 0; SHOT.w = 0; SHOT.name = null;
      if (typeof d === 'function') { try { d(); } catch (e) {} }
    },
    active: function () { return !!cur; },
    name: function () { return cur ? cur.name : null; },
    weight: function () { return cur ? w : 0; }
  };
  return api;
}
