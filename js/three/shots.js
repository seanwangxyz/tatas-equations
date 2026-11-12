// Camera close-ups: T3.shot(name, opts) for 'challenge' | 'win' | 'lose' | 'goal'.
// The camera eases to a closer framing (the opponent creature, or the scoreboard / Goal row for 'goal'),
// holds briefly and eases back to the fitted table view: about 1.5 s in total. The framing is worked out once
// when the shot starts and does not track anything afterwards, so there is no sway. A tap skips it (quick
// ease home). The table never starts a shot during the pour or while a cube is being dragged.
//
// createShots(c) where c = {
//   camera, base() -> {pos, look} (the fitted view), creature() -> {head: Vector3, height} | null,
//   board() -> {center, normal, w, h} | null, goalZone() -> {center, w, d} | null, blocked() -> bool }
// returns { start(name, opts) -> bool, step(now) -> bool (camera changed), apply(pos, look), skip(), cancel(), active(), weight() }
import * as THREE from 'three';

var IN = 0.45, OUT = 0.5, SKIP_OUT = 0.28;   // seconds
var HOLD = { challenge: 0.55, win: 0.6, lose: 0.6, goal: 0.6 };
var PRIORITY = { goal: 1, challenge: 2, win: 3, lose: 3 };
function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (6 * x - 15) + 10); } // smootherstep: starts and stops gently

export function createShots(c) {
  var cur = null, lastEnd = { name: '', t: 0 }, tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), w = 0;

  function dist(frameW, frameH) {
    var t = Math.tan(c.camera.fov * Math.PI / 360), a = c.camera.aspect || 1.5;
    return Math.max(frameH / 2 / t, frameW / 2 / (t * a));
  }
  // camera at `look + dir * d`, never further away than most of the current distance, never below the table top
  function place(look, dir, d, b) {
    var full = b.pos.distanceTo(look); d = Math.min(Math.max(d, 4), full * 0.8);
    var pos = look.clone().addScaledVector(dir, d); if (pos.y < 1.6) pos.y = 1.6;
    return { pos: pos, look: look.clone() };
  }
  function framing(name, opts) {
    var b = c.base(); if (!b) return null;
    if (name === 'goal') {
      var bd = c.board();
      if (bd) {
        var toCam = tmpA.copy(b.pos).sub(bd.center).normalize(), n = bd.normal.clone();
        if (n.dot(toCam) < 0) n.negate();
        // mostly from the player's side, high enough to look over the table at it
        var dir = n.multiplyScalar(0.4).addScaledVector(toCam, 0.6).normalize(), lk = bd.center.clone(); lk.y -= bd.h * 0.12;
        var f = place(lk, dir, dist(bd.w * 1.55, bd.h * 1.9), b);
        return f;
      }
      var gz = c.goalZone(); if (!gz) return null;
      var d0 = tmpB.copy(b.pos).sub(gz.center).normalize();
      return place(gz.center, d0.clone(), dist(gz.w * 1.15, gz.d * 2.2), b);
    }
    var cr = c.creature(); if (!cr || !cr.head) return null;
    // frame heights in creature heights: challenge = head and shoulders, win = upper body, lose = room to dance
    var h = Math.max(1.2, cr.height || 3), lower = { challenge: 0.2, win: 0.3, lose: 0.4 }[name], tall = { challenge: 1.3, win: 1.6, lose: 2.1 }[name];
    var look = cr.head.clone(); look.y -= h * lower;
    var dirC = tmpB.copy(b.pos).sub(look); dirC.y *= 0.6; dirC.normalize();
    return place(look, dirC.clone(), dist(h * tall * 0.9, h * tall), b);
  }
  var api = {
    start: function (name, opts) {
      if (!HOLD[name] || c.blocked()) return false;
      var now = performance.now();
      if (cur && (PRIORITY[name] || 0) <= (PRIORITY[cur.name] || 0)) return false;      // one at a time
      if (!cur && lastEnd.name === name && now - lastEnd.t < 2500) return false;        // not the same close-up again straight away
      var f = framing(name, opts || {}); if (!f) return false;
      var from = null;
      if (cur) { from = { pos: c.camera.position.clone(), look: cur.lastLook.clone() }; } // hand over from the shot in progress without a jump
      cur = { name: name, t0: now, hold: (opts && opts.hold) || HOLD[name], pos: f.pos, look: f.look, from: from, out: null, lastLook: new THREE.Vector3(), done: opts && opts.done };
      return true;
    },
    // advance; returns true when the camera pose changed this frame (including the frame it ends on)
    step: function (now) {
      if (!cur) return false;
      var t = (now - cur.t0) / 1000;
      if (cur.out) {
        var k = (now - cur.out.t0) / 1000 / cur.out.dur;
        w = cur.out.w0 * (1 - ease(k));
        if (k >= 1) { api.cancel(); return true; }
      } else if (t < IN) w = ease(t / IN);
      else if (t < IN + cur.hold) w = 1;
      else { cur.out = { t0: now, dur: OUT, w0: 1 }; w = 1; }
      return true;
    },
    // blend the drawn camera (pos/look already hold the fitted view plus any small cue offsets) toward the shot
    apply: function (pos, look) {
      if (!cur) return;
      if (cur.from && !cur.out) { pos.copy(cur.from.pos); look.copy(cur.from.look); }
      pos.lerp(cur.pos, w); look.lerp(cur.look, w); cur.lastLook.copy(look);
    },
    skip: function () { if (cur && !cur.out) { cur.out = { t0: performance.now(), dur: SKIP_OUT, w0: w }; cur.from = null; } },
    cancel: function () {
      if (!cur) return; var d = cur.done; lastEnd = { name: cur.name, t: performance.now() }; cur = null; w = 0;
      if (typeof d === 'function') { try { d(); } catch (e) {} }
    },
    active: function () { return !!cur; },
    name: function () { return cur ? cur.name : null; },
    weight: function () { return cur ? w : 0; }
  };
  return api;
}
