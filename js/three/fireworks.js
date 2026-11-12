// Fireworks over the stadium, for the big wins. A handful of rockets go up one after another and burst in the
// upper part of the picture (over the far side of the pitch, in front of the back stand, so they are in view
// from the seat), each burst lights the stands for a moment, with soft booms (js/fx-sfx.js). About 5 seconds,
// then it is gone completely: the points are removed, the light is put back, the frame hook is taken out.
// Nothing loops and nothing is left moving.
//
//   T3.fireworks(opts) -> true if a show started (false: no 3D picture, hidden page, a show already on)
//     opts: {rockets: 3..9 (default 6; 3 with reduced motion), colors: [[r,g,b] 0..1, ...], done: fn (once, at the end)}
//   T3.fireworksActive() -> bool
//
// GPU-cheap: ONE THREE.Points object (one draw call) for every spark, rocket and trail, additive blending, a small
// soft-dot texture; positions and colours are updated on the CPU (about 2,400 for 7 rockets on high quality, 3,000 at most). Plugs in through
// T3.ctx (js/three/table.js); the stands are lit by tinting the table's HemisphereLight colour (no new lights,
// so no shader recompiles), restored exactly at the end.
import * as THREE from 'three';

(function boot(tries) {
  var T3 = window.T3;
  if (!T3) return;
  if (!T3.ctx || !T3.ctx.scene || !T3.ctx.camera) { if (tries < 60) setTimeout(function () { boot(tries + 1); }, 100); return; }
  install(T3, T3.ctx);
})(0);

function install(T3, ctx) {
  var PALETTE = [[1, 0.18, 0.2], [1, 0.75, 0.05], [0.15, 0.55, 1], [0.35, 0.9, 0.1], [0.7, 0.35, 1], [1, 0.45, 0.1], [1, 0.3, 0.75]];
  var show = null, dotTex = null;

  function dot() {
    if (dotTex) return dotTex;
    var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.85)'); gr.addColorStop(0.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    dotTex = new THREE.CanvasTexture(cv); dotTex.colorSpace = THREE.SRGBColorSpace; return dotTex;
  }
  function reduced() { try { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function hemiLight() { var h = null; ctx.scene.traverse(function (o) { if (!h && o.isHemisphereLight) h = o; }); return h; }
  function quality() { try { var q = T3.quality ? T3.quality() : 'high'; return q === 'low' ? 0 : q === 'medium' ? 1 : 2; } catch (e) { return 2; } }

  // Where the bursts go. The seat camera looks steeply down, so no sky is in the picture: the bursts go off in the
  // air over the front of the back stand (a vertical plane a little past the far edge of the table), high enough to
  // clear the table and inside the upper part of the picture. Spread left to right, and mostly off-centre so the
  // creature in the middle doesn't hide them.
  function burstPoints(n) {
    var cam = ctx.camera, L = ctx.layout, zPlane = -(L.D / 2 + 5), out = [], ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    var plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -zPlane), hit = new THREE.Vector3();
    cam.updateMatrixWorld();
    function at(nx, ny) { ndc.set(nx, ny); ray.setFromCamera(ndc, cam); return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null; }
    var order = []; for (var i = 0; i < n; i++) order.push(i);
    for (i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), tt = order[i]; order[i] = order[j]; order[j] = tt; }   // shuffled lanes
    for (i = 0; i < n; i++) {
      var u = (order[i] + 0.25 + Math.random() * 0.5) / n;
      var nx = n === 1 ? -0.5 : u < 0.5 ? -0.86 + u / 0.5 * 0.6 : 0.26 + (u - 0.5) / 0.5 * 0.6;
      var top = at(nx, 0.9), low = at(nx, 0.45), p;
      if (top && low) {
        var y0 = Math.max(low.y, 1.5), y1 = top.y - 1.2;
        var y = y1 > y0 ? y0 + Math.random() * (y1 - y0) : (low.y + top.y) / 2;
        var k = (y - low.y) / ((top.y - low.y) || 1); p = low.clone().lerp(top, Math.max(0, Math.min(1, k)));
      } else { ray.setFromCamera(ndc.set(nx, 0.7), cam); p = cam.position.clone().add(ray.ray.direction.clone().multiplyScalar(36)); }
      out.push(p);
    }
    return out;
  }

  function start(opts) {
    if (show || !ctx.layout || document.hidden || (typeof current !== 'undefined' && current !== 'game')) return false;
    opts = opts || {};
    var q = quality(), red = reduced();
    var nR = Math.max(1, Math.min(9, opts.rockets || (red ? 3 : q === 0 ? 4 : 6)));
    var PER = red ? 40 : q === 0 ? 56 : q === 1 ? 80 : 110, TR = q === 0 ? 1 : 2;      // sparks per burst, trail points per spark
    var cols = opts.colors && opts.colors.length ? opts.colors : PALETTE;
    var pts = burstPoints(nR), dist = pts.map(function (p) { return p.distanceTo(ctx.camera.position); });
    // pool layout: per rocket [head + 6 trail] + PER sparks * (1 + TR)
    var HEAD = 7, per = HEAD + PER * (1 + TR), N = nR * per;
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    var avgD = dist.reduce(function (a, b) { return a + b; }, 0) / nR;
    var mat = new THREE.PointsMaterial({ size: 0.045 * avgD, map: dot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false, toneMapped: false });
    var points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 6;
    var rockets = [];
    for (var r = 0; r < nR; r++) {
      var B = pts[r], d = dist[r], rise = d * 0.18, c = cols[(r + Math.floor(Math.random() * cols.length)) % cols.length], c2 = Math.random() < 0.4 ? cols[Math.floor(Math.random() * cols.length)] : c;
      var launch = 0.15 + (nR > 1 ? r * 2.6 / (nR - 1) : 0) + (Math.random() - 0.5) * 0.16;
      rockets.push({ base: r * per, B: B, from: new THREE.Vector3(B.x + (Math.random() - 0.5) * d * 0.03, B.y - rise, B.z), t0: Math.max(0, launch), up: 0.9 + Math.random() * 0.2,
        c: c, c2: c2, R: d * (0.13 + Math.random() * 0.04), life: 1.2 + Math.random() * 0.3, sp: null, burst: false, pan: Math.max(-0.8, Math.min(0.8, (B.x - ctx.camera.position.x) / 18)) });
    }
    var F = { t0: performance.now(), points: points, geo: geo, mat: mat, rockets: rockets, PER: PER, TR: TR, HEAD: HEAD, N: N, pos: pos, col: col, done: opts.done, over: false, flash: 0, flashC: new THREE.Color(1, 1, 1) };
    var last = rockets.reduce(function (a, k) { return Math.max(a, k.t0 + k.up + k.life); }, 0);
    F.tEnd = last + 0.15;
    F.hemi = hemiLight(); if (F.hemi) F.hemiBase = F.hemi.color.clone();
    ctx.scene.add(points);
    F.hook = function (now) { try { step(F, now); } catch (e) { finish(F); } };
    ctx.hooks.frame.push(F.hook);
    F.safety = setTimeout(function () { finish(F); }, (F.tEnd + 2) * 1000);
    // the sounds, scheduled on the audio clock (soft: the launch whoosh, then the boom when it bursts)
    if (typeof FxSfx !== 'undefined') rockets.forEach(function (k, i) {
      if (i % 2 === 0 || nR <= 4) FxSfx.launch({ delay: k.t0, pan: k.pan });
      FxSfx.boom({ delay: k.t0 + k.up, size: 0.4 + Math.random() * 0.5, pan: k.pan });
    });
    show = F;
    ctx.dirty(); ctx.startLoop();
    return true;
  }

  function setP(F, i, x, y, z, r, g, b) { var j = i * 3; F.pos[j] = x; F.pos[j + 1] = y; F.pos[j + 2] = z; F.col[j] = r; F.col[j + 1] = g; F.col[j + 2] = b; }
  function step(F, now) {
    if (F.over) return;
    if (typeof current !== 'undefined' && current !== 'game') { finish(F); return; }
    var t = (now - F.t0) / 1000, any = false, fl = 0;
    F.rockets.forEach(function (k) {
      var b = k.base, i;
      if (t < k.t0) { for (i = 0; i < F.HEAD; i++) setP(F, b + i, 0, -999, 0, 0, 0, 0); return; }
      var u = (t - k.t0) / k.up;
      if (u < 1) {
        // going up: a bright head slowing down near the top, a short fading trail
        any = true;
        var e = 1 - Math.pow(1 - u, 2.2);
        for (i = 0; i < F.HEAD; i++) {
          var ue = Math.max(0, e - i * 0.035), a = i === 0 ? 1 : 0.55 * (1 - i / F.HEAD);
          setP(F, b + i, k.from.x + (k.B.x - k.from.x) * ue, k.from.y + (k.B.y - k.from.y) * ue, k.from.z, 1 * a, 0.88 * a, 0.6 * a);
        }
        return;
      }
      for (i = 0; i < F.HEAD; i++) setP(F, b + i, 0, -999, 0, 0, 0, 0);
      if (!k.burst) {
        k.burst = true; k.sp = [];
        for (var s = 0; s < F.PER; s++) {
          // a sphere of sparks: an even-ish spread of directions, two speed rings
          var zz = 1 - 2 * (s + 0.5) / F.PER, rr = Math.sqrt(1 - zz * zz), th = s * 2.39996 + Math.random() * 0.2, v = k.R * (s % 3 ? 1 : 0.62) * (0.9 + Math.random() * 0.2);
          k.sp.push({ vx: Math.cos(th) * rr * v, vy: zz * v, vz: Math.sin(th) * rr * v * 0.6, c: s % 4 === 0 ? k.c2 : k.c, tw: Math.random() });
        }
      }
      var age = t - k.t0 - k.up, L = age / k.life;
      if (L < 0.12) fl = Math.max(fl, 1 - L / 0.12 * 0.4), F.flashC.setRGB(k.c[0], k.c[1], k.c[2]);
      else if (L < 0.5) fl = Math.max(fl, 0.6 * (1 - (L - 0.12) / 0.38));
      var base = b + F.HEAD, G = k.R * 0.9;
      for (var s2 = 0; s2 < F.PER; s2++) {
        var p = k.sp[s2], idx = base + s2 * (1 + F.TR);
        if (L >= 1) { for (var z = 0; z <= F.TR; z++) setP(F, idx + z, 0, -999, 0, 0, 0, 0); continue; }
        any = true;
        for (var tr = 0; tr <= F.TR; tr++) {
          var ag = Math.max(0, age - tr * 0.045), ex = 1 - Math.exp(-ag * 3.2);          // fast out, then drifting (drag)
          var px = k.B.x + p.vx * ex, py = k.B.y + p.vy * ex - G * ag * ag * 0.5, pz = k.B.z + p.vz * ex;
          var fade = Math.pow(1 - L, 1.6) * (tr === 0 ? 1 : 0.45 / tr);
          var tw = L > 0.6 ? (0.6 + 0.4 * Math.sin((p.tw * 6 + age * 22))) : 1;          // a little sparkle as it dies
          var hot = Math.max(0, 1 - L * 7);                                              // white-hot at first
          setP(F, idx + tr, px, py, pz, (p.c[0] + (1 - p.c[0]) * hot) * fade * tw, (p.c[1] + (1 - p.c[1]) * hot) * fade * tw, (p.c[2] + (1 - p.c[2]) * hot) * fade * tw);
        }
      }
    });
    F.geo.attributes.position.needsUpdate = true; F.geo.attributes.color.needsUpdate = true;
    // light the stands: tint the sky light toward the burst colour for a moment (eases back by itself)
    if (F.hemi && F.hemiBase) { F.flash += (fl - F.flash) * 0.35; F.hemi.color.copy(F.hemiBase).lerp(F.flashC, Math.min(0.55, F.flash * 0.55)); }
    ctx.dirty();
    if (t > F.tEnd || (!any && t > 1 && F.rockets.every(function (k) { return k.burst; }))) finish(F);
  }

  function finish(F) {
    if (!F || F.over) return;
    F.over = true; clearTimeout(F.safety);
    try { var i = ctx.hooks.frame.indexOf(F.hook); if (i >= 0) ctx.hooks.frame.splice(i, 1); } catch (e) {}
    try { ctx.scene.remove(F.points); } catch (e) {}
    try { F.geo.dispose(); F.mat.dispose(); } catch (e) {}   // (the dot texture is kept for the next show)
    try { if (F.hemi && F.hemiBase) F.hemi.color.copy(F.hemiBase); } catch (e) {}
    if (show === F) show = null;
    try { ctx.dirty(); ctx.startLoop(); } catch (e) {}
    var d = F.done; F.done = null;
    if (d) { try { d(); } catch (e) {} }
  }

  T3.fireworks = function (opts) { try { return start(opts); } catch (e) { try { console.warn('[fireworks]', e); } catch (e2) {} return false; } };
  T3.fireworksActive = function () { return !!show; };
}
