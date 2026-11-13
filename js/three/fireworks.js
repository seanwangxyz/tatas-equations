// Fireworks over the stadium, for the big wins: a short COMPOSED show that ends. A single opening shell, then pairs,
// then the finale; for the biggest wins (rockets >= 7, or opts.big) the last shell draws his shirt number in sparks.
// Shell types (all original): peony (a round ball of colour), willow (long golden droops), ring (a flat circle,
// tilted toward us), cube (a burst that opens into the shape of a game cube) and number (his number, in sparks).
// Each burst lights the stands softly for a moment. In daylight fireworks look weak, so the day show is confetti
// cannons and streamers from both sides of the far stand instead. About 5 to 7 seconds; then everything is removed,
// the light is put back, the frame hook is taken out. Nothing loops and nothing is left moving.
// Reduce flashing (A11y.calm) or prefers-reduced-motion: 3 gentle shells (no white-hot start, no sparkle), or a
// small confetti volley in daylight.
//
//   T3.fireworks(opts) -> true if a show started (false: no 3D picture, hidden page, a show already on)
//     opts: {rockets: 3..9 (default 6), big: bool, number: '7' (default S.jersey), day: true|false (default: from
//            the venue's light), colors: [[r,g,b] 0..1, ...], done: fn (once, at the end)}
//   T3.fireworksActive() -> bool
//
// GPU-cheap: ONE THREE.Points object (one draw call) for every spark, rocket and trail (one InstancedMesh for the
// day confetti), additive blending, a small soft-dot texture; positions and colours are updated on the CPU (at most
// about 3,500 points on high quality). The stands are lit by tinting the table's HemisphereLight colour (no new
// lights, so no shader recompiles), restored exactly at the end.
import * as THREE from 'three';

(function boot(tries) {
  var T3 = window.T3;
  if (!T3) return;
  if (!T3.ctx || !T3.ctx.scene || !T3.ctx.camera) { if (tries < 60) setTimeout(function () { boot(tries + 1); }, 100); return; }
  install(T3, T3.ctx);
})(0);

function install(T3, ctx) {
  var PALETTE = [[1, 0.18, 0.2], [1, 0.75, 0.05], [0.15, 0.55, 1], [0.35, 0.9, 0.1], [0.7, 0.35, 1], [1, 0.45, 0.1], [1, 0.3, 0.75]];
  var GOLD = [1, 0.72, 0.28];
  var show = null, dotTex = null;

  function dot() {
    if (dotTex) return dotTex;
    var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.85)'); gr.addColorStop(0.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    dotTex = new THREE.CanvasTexture(cv); dotTex.colorSpace = THREE.SRGBColorSpace; return dotTex;
  }
  function calm() {
    try { if (window.A11y && A11y.calm && A11y.calm()) return true; } catch (e) {}
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function hemiLight() { var h = null; ctx.scene.traverse(function (o) { if (!h && o.isHemisphereLight) h = o; }); return h; }
  function quality() { try { var q = T3.quality ? T3.quality() : 'high'; return q === 'low' ? 0 : q === 'medium' ? 1 : 2; } catch (e) { return 2; } }
  // daylight? the venue's fog (or background) colour tells: bright = day
  function isDay() {
    try {
      var c = ctx.scene.fog && ctx.scene.fog.color ? ctx.scene.fog.color : (ctx.scene.background && ctx.scene.background.isColor ? ctx.scene.background : null);
      if (!c) return false;
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.22;
    } catch (e) { return false; }
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Where things go. The seat camera looks steeply down, so no sky is in the picture: the bursts go off in the air
  // over the front of the back stand (a vertical plane a little past the far edge of the table).
  function planeAt(z) {
    var cam = ctx.camera, L = ctx.layout, zPlane = z != null ? z : -(L.D / 2 + 5), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    var plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -zPlane), hit = new THREE.Vector3();
    cam.updateMatrixWorld();
    return function (nx, ny) {
      ndc.set(nx, ny); ray.setFromCamera(ndc, cam);
      if (ray.ray.intersectPlane(plane, hit)) return hit.clone();
      return cam.position.clone().add(ray.ray.direction.clone().multiplyScalar(36));
    };
  }

  // ---------------------------------------------------------------- the composed night show
  // returns [{type, nx, ny, t0}] : lanes left/right of the creature in the middle, a rhythm with pauses
  function compose(n, big, gentle) {
    var seq = [];
    if (gentle) {
      [['peony', -0.55, 0.72, 0.2], ['ring', 0.5, 0.7, 1.6], ['peony', -0.1, 0.8, 3.0]].slice(0, Math.max(1, Math.min(3, n))).forEach(function (s) { seq.push({ type: s[0], nx: s[1], ny: s[2], t0: s[3] }); });
      return seq;
    }
    // opening: one peony, high and alone
    seq.push({ type: 'peony', nx: -0.5, ny: 0.68, t0: 0.15 });
    var middle = [['ring', 0.55, 0.62], ['willow', -0.7, 0.7], ['cube', 0.4, 0.64], ['peony', -0.3, 0.6], ['ring', 0.7, 0.68], ['willow', 0.15, 0.72], ['peony', -0.75, 0.64]];
    var mid = Math.max(0, n - (big ? 3 : 2)), t = 1.25;
    for (var i = 0; i < mid; i++) { var m = middle[i % middle.length]; seq.push({ type: m[0], nx: m[1], ny: m[2], t0: t }); t += i % 2 ? 0.95 : 0.35; }   // in pairs: two close, then a breath
    if (big) {
      // finale: two willows frame the middle, then his number in sparks, alone, high in the middle-right
      seq.push({ type: 'willow', nx: -0.65, ny: 0.7, t0: t + 0.2 });
      seq.push({ type: 'number', nx: 0.45, ny: 0.58, t0: t + 0.75 });
    } else {
      seq.push({ type: 'cube', nx: 0.5, ny: 0.64, t0: t + 0.25 });
    }
    return seq;
  }
  // the spark directions (velocity vectors, unit-ish) for each shell type
  function shellSparks(type, PER, R, numberPts) {
    var out = [], i, z, r, th;
    if (type === 'peony' || type === 'willow') {
      for (i = 0; i < PER; i++) { z = 1 - 2 * (i + 0.5) / PER; r = Math.sqrt(1 - z * z); th = i * 2.39996 + Math.random() * 0.2; var v = R * (type === 'willow' ? 0.85 : (i % 3 ? 1 : 0.62)) * rnd(0.9, 1.1); out.push([Math.cos(th) * r * v, z * v, Math.sin(th) * r * v * 0.6]); }
    } else if (type === 'ring') {
      var tilt = rnd(0.35, 0.6), rot = rnd(-0.5, 0.5);
      for (i = 0; i < PER; i++) { th = i / PER * Math.PI * 2; var x = Math.cos(th), y = Math.sin(th) * Math.cos(tilt), zz = Math.sin(th) * Math.sin(tilt) * 0.5; out.push([(x * Math.cos(rot) - y * Math.sin(rot)) * R, (x * Math.sin(rot) + y * Math.cos(rot)) * R, zz * R]); }
    } else if (type === 'cube') {
      // the 12 edges of a cube, turned a little so it reads as 3D
      var E = [[[-1, -1, -1], [1, -1, -1]], [[-1, 1, -1], [1, 1, -1]], [[-1, -1, 1], [1, -1, 1]], [[-1, 1, 1], [1, 1, 1]], [[-1, -1, -1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1]], [[-1, -1, 1], [-1, 1, 1]], [[1, -1, 1], [1, 1, 1]], [[-1, -1, -1], [-1, -1, 1]], [[1, -1, -1], [1, -1, 1]], [[-1, 1, -1], [-1, 1, 1]], [[1, 1, -1], [1, 1, 1]]];
      var ay = 0.6, ax = 0.42, s = R * 0.62;
      for (i = 0; i < PER; i++) {
        var e = E[i % 12], k = (Math.floor(i / 12) + 0.5) / Math.ceil(PER / 12), p = [e[0][0] + (e[1][0] - e[0][0]) * k, e[0][1] + (e[1][1] - e[0][1]) * k, e[0][2] + (e[1][2] - e[0][2]) * k];
        var x1 = p[0] * Math.cos(ay) + p[2] * Math.sin(ay), z1 = -p[0] * Math.sin(ay) + p[2] * Math.cos(ay), y1 = p[1] * Math.cos(ax) - z1 * Math.sin(ax), z2 = p[1] * Math.sin(ax) + z1 * Math.cos(ax);
        out.push([x1 * s, y1 * s, z2 * s * 0.5]);
      }
    } else if (type === 'number') {
      numberPts.forEach(function (q) { out.push([q[0] * R, q[1] * R, 0]); });
    }
    return out;
  }
  // his shirt number as points: drawn on a small canvas, sampled on a grid (x, y in -1..1)
  function numberPoints(txt, maxN) {
    var cv = document.createElement('canvas'), W = 96, H = 64; cv.width = W; cv.height = H; var g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 ' + (txt.length > 1 ? 54 : 60) + 'px "Trebuchet MS", sans-serif';
    g.fillText(txt, W / 2, H / 2 + 3);
    var d = g.getImageData(0, 0, W, H).data, pts = [], step = 3;
    for (var y = 0; y < H; y += step) for (var x = 0; x < W; x += step) if (d[(y * W + x) * 4 + 3] > 140) pts.push([(x - W / 2) / (H / 2), -(y - H / 2) / (H / 2)]);
    while (pts.length > maxN) pts.splice(Math.floor(Math.random() * pts.length), 1);
    return pts;
  }

  function startNight(opts) {
    var q = quality(), gentle = calm();
    var nR = Math.max(1, Math.min(9, opts.rockets || (q === 0 ? 4 : 6))), big = !!opts.big || nR >= 7;
    var seq = compose(gentle ? 3 : nR, big && !gentle, gentle);
    var PERB = gentle ? 40 : q === 0 ? 56 : q === 1 ? 80 : 110, TR = q === 0 ? 1 : 2;
    var cols = opts.colors && opts.colors.length ? opts.colors : PALETTE;
    var at = planeAt(), numTxt = String(opts.number || (typeof S !== 'undefined' && S && S.jersey) || '7').slice(0, 2);
    var rockets = [], N = 0, HEAD = 7;
    seq.forEach(function (s, r) {
      var B = at(s.nx, s.ny), low = at(s.nx, 0.42), d = B.distanceTo(ctx.camera.position);
      var type = s.type, PER = type === 'willow' ? Math.round(PERB * 0.7) : type === 'ring' ? Math.round(PERB * 0.75) : type === 'cube' ? Math.max(48, Math.round(PERB / 12) * 12) : PERB;
      var R = d * (type === 'number' ? 0.13 : type === 'willow' ? 0.15 : 0.14) * rnd(0.95, 1.05);
      var npts = type === 'number' ? numberPoints(numTxt, q === 0 ? 120 : 200) : null; if (npts) PER = npts.length;
      var trs = type === 'willow' ? TR + 2 : TR;
      var c = cols[(r * 3 + Math.floor(Math.random() * cols.length)) % cols.length], c2 = Math.random() < 0.4 ? cols[Math.floor(Math.random() * cols.length)] : c;
      if (type === 'willow') { c = GOLD; c2 = [1, 0.85, 0.5]; }
      if (type === 'number') { c = [1, 0.85, 0.3]; c2 = [1, 1, 1]; }
      var rise = Math.max(1.5, B.y - low.y);
      rockets.push({ base: N, type: type, B: B, from: new THREE.Vector3(B.x + rnd(-0.015, 0.015) * d, B.y - rise, B.z), t0: s.t0, up: type === 'number' ? 1.15 : rnd(0.9, 1.05), PER: PER, TR: trs,
        c: c, c2: c2, R: R, life: type === 'willow' ? 2.3 : type === 'number' ? 2.4 : rnd(1.25, 1.5), sp: shellSparks(type, PER, R, npts), burst: false,
        pan: Math.max(-0.8, Math.min(0.8, (B.x - ctx.camera.position.x) / 18)) });
      N += HEAD + PER * (1 + trs);
    });
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) pos[i * 3 + 1] = -999;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    var avgD = rockets.reduce(function (a, k) { return a + k.B.distanceTo(ctx.camera.position); }, 0) / rockets.length;
    var mat = new THREE.PointsMaterial({ size: 0.045 * avgD, map: dot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false, toneMapped: false });
    var points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 6;
    var F = { kind: 'night', t0: performance.now(), points: points, geo: geo, mat: mat, rockets: rockets, HEAD: HEAD, N: N, pos: pos, col: col, done: opts.done, over: false, flash: 0, flashC: new THREE.Color(1, 1, 1), gentle: gentle };
    F.tEnd = rockets.reduce(function (a, k) { return Math.max(a, k.t0 + k.up + k.life); }, 0) + 0.15;
    F.hemi = hemiLight(); if (F.hemi) F.hemiBase = F.hemi.color.clone();
    ctx.scene.add(points);
    if (typeof FxSfx !== 'undefined') rockets.forEach(function (k, i) {
      if (i % 2 === 0 || rockets.length <= 4) FxSfx.launch({ delay: k.t0, pan: k.pan });
      FxSfx.boom({ delay: k.t0 + k.up, size: k.type === 'number' ? 0.9 : k.type === 'willow' ? 0.7 : rnd(0.4, 0.8), pan: k.pan });
    });
    return F;
  }
  function setP(F, i, x, y, z, r, g, b) { var j = i * 3; F.pos[j] = x; F.pos[j + 1] = y; F.pos[j + 2] = z; F.col[j] = r; F.col[j + 1] = g; F.col[j + 2] = b; }
  function hide(F, i) { F.pos[i * 3 + 1] = -999; F.col[i * 3] = F.col[i * 3 + 1] = F.col[i * 3 + 2] = 0; }
  function stepNight(F, t) {
    var any = false, fl = 0;
    F.rockets.forEach(function (k) {
      var b = k.base, i;
      if (t < k.t0) { any = true; return; }
      var u = (t - k.t0) / k.up;
      if (u < 1) {
        any = true;
        var e = 1 - Math.pow(1 - u, 2.2);
        for (i = 0; i < F.HEAD; i++) {
          var ue = Math.max(0, e - i * 0.035), a = i === 0 ? 0.75 : 0.45 * (1 - i / F.HEAD);
          setP(F, b + i, k.from.x + (k.B.x - k.from.x) * ue, k.from.y + (k.B.y - k.from.y) * ue, k.from.z, a, 0.88 * a, 0.6 * a);
        }
        return;
      }
      for (i = 0; i < F.HEAD; i++) hide(F, b + i);
      var age = t - k.t0 - k.up, L = age / k.life;
      if (!k.burst) { k.burst = true; }
      var soft = F.gentle ? 0.25 : 0.55;
      if (L < 0.12) { fl = Math.max(fl, (1 - L / 0.12 * 0.4) * soft / 0.55); F.flashC.setRGB(k.c[0], k.c[1], k.c[2]); }
      else if (L < 0.5) fl = Math.max(fl, 0.6 * (1 - (L - 0.12) / 0.38) * soft / 0.55);
      var base = b + F.HEAD, stride = 1 + k.TR, willow = k.type === 'willow', num = k.type === 'number';
      var drag = willow ? 2.2 : num ? 5.5 : 3.2, Gr = k.R * (willow ? 1.25 : num ? 0.35 : 0.9);
      for (var s = 0; s < k.PER; s++) {
        var p = k.sp[s], idx = base + s * stride;
        if (L >= 1) { for (var z = 0; z < stride; z++) hide(F, idx + z); continue; }
        any = true;
        for (var tr = 0; tr < stride; tr++) {
          var ag = Math.max(0, age - tr * (willow ? 0.08 : 0.045)), ex = 1 - Math.exp(-ag * drag);
          var hold = num ? Math.max(0, ag - 0.9) : ag;                                   // the number holds still for a moment before it falls
          var px = k.B.x + p[0] * ex, py = k.B.y + p[1] * ex - Gr * hold * hold * 0.5, pz = k.B.z + p[2] * ex;
          var fade = Math.pow(1 - L, willow ? 1.1 : 1.6) * (tr === 0 ? 1 : (willow ? 0.7 : 0.45) / tr);
          var tw = (!F.gentle && L > 0.6 && !num) ? (0.6 + 0.4 * Math.sin(s * 1.7 + age * 22)) : 1;
          var hot = F.gentle ? 0 : Math.max(0, 1 - L * 7);
          var c = s % 4 === 0 ? k.c2 : k.c;
          setP(F, idx + tr, px, py, pz, (c[0] + (1 - c[0]) * hot) * fade * tw, (c[1] + (1 - c[1]) * hot) * fade * tw, (c[2] + (1 - c[2]) * hot) * fade * tw);
        }
      }
    });
    F.geo.attributes.position.needsUpdate = true; F.geo.attributes.color.needsUpdate = true;
    if (F.hemi && F.hemiBase) { F.flash += (fl - F.flash) * 0.3; F.hemi.color.copy(F.hemiBase).lerp(F.flashC, Math.min(0.45, F.flash * 0.45)); }
    return any;
  }

  // ---------------------------------------------------------------- the daytime show: confetti cannons and streamers
  function startDay(opts) {
    // the cannons stand at the sides of the picture, over the far half of the table, so the pieces arc over the
    // table and flutter down through the picture (they shrink away before they land on anything)
    var q = quality(), gentle = calm(), at = planeAt(-ctx.layout.D * 0.2);
    var per = gentle ? 50 : q === 0 ? 70 : q === 1 ? 110 : 150, volleys = gentle ? [[-1, 0.2]] : [[-1, 0.15], [1, 0.75], [-1, 1.6], [1, 1.6]];
    var N = per * volleys.length, d = at(0, 0.3).distanceTo(ctx.camera.position), S0 = d * 0.02;
    var geo = new THREE.PlaneGeometry(1, 1), mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, fog: false });
    var mesh = new THREE.InstancedMesh(geo, mat, N); mesh.frustumCulled = false; mesh.renderOrder = 6;
    var pal = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b', '#ffffff', '#b197fc', '#ff922b'], tc = new THREE.Color(), P = [];
    volleys.forEach(function (v, vi) {
      var side = v[0], o = at(side * 1.02, -0.2), aim = at(side * 0.05, 0.95), dir = aim.clone().sub(o), dist = dir.length(); dir.normalize();
      for (var i = 0; i < per; i++) {
        var streamer = i % 6 === 0, sp = dist * rnd(2.4, 3.1);
        var vel = dir.clone().multiplyScalar(sp); vel.x += rnd(-0.25, 0.25) * sp; vel.y += rnd(-0.1, 0.15) * sp; vel.z += rnd(-0.15, 0.15) * sp;
        P.push({ p: o.clone(), v: vel, t0: v[1] + rnd(0, 0.12), sx: streamer ? S0 * 0.35 : S0, sy: streamer ? S0 * 5 : S0 * 0.6, ax: rnd(0, 6), ay: rnd(0, 6), spin: rnd(4, 10) * (streamer ? 0.4 : 1), streamer: streamer, ph: rnd(0, 6) });
        mesh.setColorAt(vi * per + i, tc.set(pal[(i + vi) % pal.length]));
      }
    });
    mesh.instanceColor.needsUpdate = true;
    var zero = new THREE.Matrix4().makeScale(0, 0, 0); for (var k = 0; k < N; k++) mesh.setMatrixAt(k, zero);
    ctx.scene.add(mesh);
    var F = { kind: 'day', t0: performance.now(), mesh: mesh, geo: geo, mat: mat, P: P, done: opts.done, over: false, life: 4.2, g: d * 0.55, last: 0 };
    F.tEnd = volleys.reduce(function (a, v) { return Math.max(a, v[1]); }, 0) + F.life + 0.2;
    if (typeof FxSfx !== 'undefined') volleys.forEach(function (v) { FxSfx.boom({ delay: v[1], size: 0.22, pan: v[0] * 0.7 }); FxSfx.swish({ delay: v[1] + 0.02 }); });
    return F;
  }
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function stepDay(F, t) {
    var dt = Math.min(0.05, Math.max(0, t - F.last)); F.last = t; var any = false;
    F.P.forEach(function (p, i) {
      if (t < p.t0) { any = true; return; }
      var age = t - p.t0;
      if (age > F.life) { F.mesh.setMatrixAt(i, _zero); return; }
      any = true;
      p.v.y -= F.g * dt; var drag = Math.exp(-dt * (p.streamer ? 1.6 : 2.6)); p.v.multiplyScalar(drag);
      var fall = -F.g * (p.streamer ? 0.1 : 0.07); if (p.v.y < fall) p.v.y = fall + (p.v.y - fall) * Math.exp(-dt * 5);
      p.p.addScaledVector(p.v, dt); p.p.x += Math.sin(age * 2.6 + p.ph) * F.g * 0.004;
      var a = age * p.spin; _e.set(p.ax + a, p.ay + a * 0.7, p.streamer ? Math.sin(age * 3 + p.ph) * 0.8 : a * 0.5); _q.setFromEuler(_e);
      var shrink = age > F.life - 0.7 ? Math.max(0, (F.life - age) / 0.7) : 1;
      _s.set(p.sx * shrink, p.sy * shrink, 1); _m.compose(p.p, _q, _s); F.mesh.setMatrixAt(i, _m);
    });
    F.mesh.instanceMatrix.needsUpdate = true;
    return any;
  }

  // ---------------------------------------------------------------- common
  function start(opts) {
    if (show || !ctx.layout || document.hidden || (typeof current !== 'undefined' && current !== 'game')) return false;
    opts = opts || {};
    var day = opts.day != null ? !!opts.day : isDay();
    var F = day ? startDay(opts) : startNight(opts);
    F.hook = function (now) { try { step(F, now); } catch (e) { finish(F); } };
    ctx.hooks.frame.push(F.hook);
    F.safety = setTimeout(function () { finish(F); }, (F.tEnd + 2) * 1000);
    show = F;
    ctx.dirty(); ctx.startLoop();
    return true;
  }
  function step(F, now) {
    if (F.over) return;
    if (typeof current !== 'undefined' && current !== 'game') { finish(F); return; }
    var t = (now - F.t0) / 1000;
    var any = F.kind === 'day' ? stepDay(F, t) : stepNight(F, t);
    ctx.dirty();
    if (t > F.tEnd || (!any && t > 1)) finish(F);
  }
  function finish(F) {
    if (!F || F.over) return;
    F.over = true; clearTimeout(F.safety);
    try { var i = ctx.hooks.frame.indexOf(F.hook); if (i >= 0) ctx.hooks.frame.splice(i, 1); } catch (e) {}
    try { if (F.points) ctx.scene.remove(F.points); if (F.mesh) ctx.scene.remove(F.mesh); } catch (e) {}
    try { if (F.geo) F.geo.dispose(); if (F.mat) F.mat.dispose(); if (F.mesh) F.mesh.dispose(); } catch (e) {}   // (the dot texture is kept for the next show)
    try { if (F.hemi && F.hemiBase) F.hemi.color.copy(F.hemiBase); } catch (e) {}
    if (show === F) show = null;
    try { ctx.dirty(); ctx.startLoop(); } catch (e) {}
    var d = F.done; F.done = null;
    if (d) { try { d(); } catch (e) {} }
  }

  T3.fireworks = function (opts) { try { return start(opts); } catch (e) { try { console.warn('[fireworks]', e); } catch (e2) {} return false; } };
  T3.fireworksActive = function () { return !!show; };
  T3._fireworksShow = function () { return show; };   // checks
}
