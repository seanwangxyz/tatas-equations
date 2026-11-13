// Skies and far backgrounds for the venues. Everything is painted ONCE into canvas textures when the venue is built
// and never moves: no drifting clouds, no twinkling. Cheap to draw:
//   makeSky(o)      -> a Group: the sky dome (one draw call; it is drawn after the solid scene with the depth test on, so
//                      it only costs pixels where the sky is really seen), plus round stars (one Points draw call) and a
//                      moon (one sprite) at night.
//   makeBackdrop(o) -> a far ring (one draw call) with hills, a town skyline, islands or crater ridges silhouetted
//                      against the sky, hazed by distance; lit windows at dusk and night (static).
// Directions: azimuth az = atan2(x, -z) (0 = straight over the back stand, as seen from the seat; + = to the right),
// elevation el in radians above the horizon.
import * as THREE from 'three';

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function css(c) { return '#' + new THREE.Color(c).getHexString(); }
function rgba(c, a) { var k = new THREE.Color(c); return 'rgba(' + Math.round(k.r * 255) + ',' + Math.round(k.g * 255) + ',' + Math.round(k.b * 255) + ',' + a + ')'; }
function mix(a, b, k) { return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex(); }
function smallScreen() { try { return Math.min(screen.width, screen.height) < 820 || (window.T3 && window.T3.quality && window.T3.quality() === 'low'); } catch (e) { return false; } }

var E0 = 0.17; // the dome texture starts ~10 degrees below the horizon
var VS = 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p; }';
var FS = [
  'uniform sampler2D map; varying vec3 vD;',
  'void main(){ vec3 d = normalize(vD);',
  '  float u = atan(d.x, -d.z) / 6.2831853 + 0.5;',
  '  float v = clamp((asin(clamp(d.y, -1.0, 1.0)) + ' + E0.toFixed(2) + ') / (1.5707963 + ' + E0.toFixed(2) + '), 0.0, 1.0);',
  '  gl_FragColor = vec4(texture2D(map, vec2(u, v)).rgb, 1.0);',
  '  #include <colorspace_fragment>',
  '}'].join('\n');

// o = { stops: [[elevation 0..1 (of 90 deg), color], ...] from the horizon up, low: color below the horizon,
//       sun: { az, el, col, disc (deg), halo } | null, clouds: { n, lit, shade, rim, kind: 'cumulus'|'streak'|'mixed', seed, high },
//       stars: n, moon: { az, el } | null, haze: color at the horizon line (optional) }
export function makeSky(o) {
  var W = smallScreen() ? 1024 : 2048, H = W / 4, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var g = cv.getContext('2d'), R = rng((o.clouds && o.clouds.seed) || 7);
  function Y(el) { return H * (1 - (el + E0) / (Math.PI / 2 + E0)); }        // elevation (rad) -> canvas y
  function X(az) { return ((az / (2 * Math.PI) + 0.5) % 1 + 1) % 1 * W; }     // azimuth -> canvas x
  // 1. the gradient
  var gr = g.createLinearGradient(0, Y(Math.PI / 2), 0, Y(0));
  o.stops.slice().reverse().forEach(function (s) { gr.addColorStop(1 - s[0], css(s[1])); });
  g.fillStyle = gr; g.fillRect(0, 0, W, Y(0) + 1);
  var gl = g.createLinearGradient(0, Y(0), 0, H); gl.addColorStop(0, css(o.haze != null ? o.haze : o.stops[0][1])); gl.addColorStop(1, css(o.low)); g.fillStyle = gl; g.fillRect(0, Y(0), W, H - Y(0));
  // a soft brighter band at the horizon (haze)
  if (o.haze != null) { var hz = g.createLinearGradient(0, Y(0.16), 0, Y(-0.02)); hz.addColorStop(0, rgba(o.haze, 0)); hz.addColorStop(1, rgba(o.haze, 0.85)); g.fillStyle = hz; g.fillRect(0, Y(0.16), W, Y(-0.02) - Y(0.16)); }
  // 2. the sun's glow (stretched by 1/cos(el) so it reads round on the dome), and its disc
  function blob(az, el, rDeg, stops, squash) {
    var x = X(az), y = Y(el), r = rDeg / 360 * W, sx = 1 / Math.max(0.25, Math.cos(el));
    [-W, 0, W].forEach(function (off) {
      g.save(); g.translate(x + off, y); g.scale(sx, squash || 1);
      var rg = g.createRadialGradient(0, 0, 0, 0, 0, r); stops.forEach(function (s) { rg.addColorStop(s[0], s[1]); }); g.fillStyle = rg; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore();
    });
  }
  if (o.sun) {
    var s = o.sun;
    blob(s.az, s.el, s.halo || 60, [[0, rgba(s.col, 0.55)], [0.25, rgba(s.col, 0.22)], [1, rgba(s.col, 0)]], 0.8);
    if (s.disc) blob(s.az, s.el, s.disc, [[0, 'rgba(255,255,250,1)'], [0.55, rgba(mix(s.col, 0xffffff, 0.6), 0.95)], [1, rgba(s.col, 0)]]);
  }
  // 3. still clouds
  var C = o.clouds;
  if (C && C.n) {
    var sunX = o.sun ? X(o.sun.az) : W / 2;
    for (var i = 0; i < C.n; i++) {
      var kind = C.kind === 'mixed' ? (R() < 0.45 ? 'streak' : 'cumulus') : C.kind;
      var az = (R() * 2 - 1) * Math.PI, el = (C.high ? 0.05 + R() * 0.45 : 0.04 + Math.pow(R(), 1.8) * 0.26);
      var x = X(az), y = Y(el), sxk = 1 / Math.max(0.3, Math.cos(el)), size = (kind === 'streak' ? 26 : 8) * (0.6 + R() * 0.8) * (1 - el * 0.8);
      var toSun = Math.sign(((sunX - x + W * 1.5) % W) - W / 2) || 1; // which side the sun is on
      [-W, 0, W].forEach(function (off) {
        if (x + off < -size * 12 || x + off > W + size * 12) return;
        g.save(); g.translate(x + off, y); g.scale(sxk, 1);
        var u = size / 360 * W;
        if (kind === 'streak') { // a long thin cloud lit from below / the side (sunset)
          for (var k = 0; k < 7; k++) {
            var px = (R() - 0.5) * u * 1.6, py = (R() - 0.5) * u * 0.08, rw = u * (0.35 + R() * 0.5), rh = u * (0.035 + R() * 0.03);
            g.save(); g.translate(px, py); g.scale(1, rh / rw);
            var rg = g.createRadialGradient(0, 0, 0, 0, 0, rw); rg.addColorStop(0, rgba(C.lit, 0.75)); rg.addColorStop(0.6, rgba(C.lit, 0.35)); rg.addColorStop(1, rgba(C.lit, 0));
            g.fillStyle = rg; g.fillRect(-rw, -rw, 2 * rw, 2 * rw); g.restore();
          }
        } else { // a cumulus: puffs along a flat base, shaded underneath, a bright rim toward the sun
          var n = 6 + Math.floor(R() * 7), puffs = [];
          for (var p = 0; p < n; p++) { var t = p / (n - 1) - 0.5, pr = u * (0.16 + R() * 0.14) * (1 - Math.abs(t) * 0.9); puffs.push([t * u * 1.1 + (R() - 0.5) * u * 0.1, -pr * (0.5 + R() * 0.6), pr]); }
          var layer = function (col, a, dx, dy, grow) { puffs.forEach(function (q) { var r = q[2] * grow, rg = g.createRadialGradient(q[0] + dx, q[1] + dy, 0, q[0] + dx, q[1] + dy, r); rg.addColorStop(0, rgba(col, a)); rg.addColorStop(0.78, rgba(col, a * 0.9)); rg.addColorStop(1, rgba(col, 0)); g.fillStyle = rg; g.fillRect(q[0] + dx - r, q[1] + dy - r, 2 * r, 2 * r); }); };
          layer(C.shade, 0.9, 0, u * 0.02, 1.05);
          layer(C.lit, 0.95, toSun * u * 0.015, -u * 0.035, 0.9);
          if (C.rim) layer(C.rim, 0.55, toSun * u * 0.05, -u * 0.06, 0.62);
          // flat, darker base
          g.fillStyle = rgba(C.shade, 0.35); g.fillRect(-u * 0.55, -u * 0.01, u * 1.1, u * 0.03);
        }
        g.restore();
      });
    }
  }
  var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping;
  var mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex } }, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
  mat.skyTex = tex; // an own property, so the table's disposeTree() frees it with the venue
  var dome = new THREE.Mesh(new THREE.SphereGeometry(165, 40, 20), mat);
  dome.renderOrder = 50; dome.frustumCulled = false; dome.name = 'sky'; dome.userData.glow = false; // drawn after the solid scene: only the sky's own pixels
  var grp = new THREE.Group(); grp.name = 'skyGroup'; grp.add(dome);
  // round stars, one draw call, static
  if (o.stars) {
    var n2 = o.stars, pos = new Float32Array(n2 * 3), col = new Float32Array(n2 * 3), RS = rng(4242), c = new THREE.Color();
    for (var j = 0; j < n2; j++) {
      var a = (RS() * 2 - 1) * Math.PI, e = 0.12 + Math.asin(RS()) * 0.9, rr = 150;
      pos[j * 3] = Math.sin(a) * Math.cos(e) * rr; pos[j * 3 + 1] = Math.sin(e) * rr - 5; pos[j * 3 + 2] = -Math.cos(a) * Math.cos(e) * rr;
      var b = 0.35 + Math.pow(RS(), 3) * 0.65; c.setHSL(0.6 + (RS() - 0.5) * 0.15, 0.4, 0.75); col[j * 3] = c.r * b; col[j * 3 + 1] = c.g * b; col[j * 3 + 2] = c.b * b;
    }
    var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    stars.renderOrder = 51; stars.frustumCulled = false; stars.name = 'stars'; grp.add(stars);
  }
  if (o.moon) {
    var mm = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    var ma = o.moon.az, me = o.moon.el, mr = 148; mm.position.set(Math.sin(ma) * Math.cos(me) * mr, Math.sin(me) * mr - 5, -Math.cos(ma) * Math.cos(me) * mr); mm.scale.set(15, 15, 1); mm.renderOrder = 52; mm.name = 'moon'; grp.add(mm);
  }
  grp.userData.dispose = function () { tex.dispose(); mat.dispose(); dome.geometry.dispose(); };
  return grp;
}
var dotT = null;
function dotTexture() {
  if (dotT) return dotT;
  var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  dotT = new THREE.CanvasTexture(c); dotT.colorSpace = THREE.SRGBColorSpace; return dotT;
}
export { dotTexture };
function moonTexture() {
  var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
  var halo = g.createRadialGradient(64, 64, 10, 64, 64, 64); halo.addColorStop(0, 'rgba(210,225,255,.45)'); halo.addColorStop(0.35, 'rgba(170,190,240,.15)'); halo.addColorStop(1, 'rgba(150,170,230,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 128, 128);
  var body = g.createRadialGradient(58, 58, 2, 64, 64, 15); body.addColorStop(0, '#fbfbf2'); body.addColorStop(1, '#d9dccd');
  g.fillStyle = body; g.beginPath(); g.arc(64, 64, 15, 0, 6.2832); g.fill();
  g.fillStyle = 'rgba(150,155,150,.35)'; [[59, 60, 3.5], [69, 66, 2.6], [62, 71, 2.2], [70, 57, 1.8]].forEach(function (k) { g.beginPath(); g.arc(k[0], k[1], k[2], 0, 6.2832); g.fill(); });
  var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ----- the far ring: silhouettes against the sky -----
// o = { kind: 'town' | 'hills' | 'islands' | 'ridges', near: color (closest layer), far: color (haze), lights: 0..1 (windows lit),
//       seed, y0 (floor y), r (radius), open: [az0, az1] (optional: leave this arc empty, e.g. the sea) }
export function makeBackdrop(o) {
  var W = smallScreen() ? 1024 : 2048, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var g = cv.getContext('2d'), R = rng(o.seed || 31), r = o.r || 140, hgt = o.h || 26;
  // u along the ring: CylinderGeometry has x = r sin(theta), z = r cos(theta): theta = 0 is in front (+z)
  function U(az) { var th = Math.PI - az; return ((th / (2 * Math.PI)) % 1 + 1) % 1 * W; } // az = atan2(x, -z) -> theta = PI - az
  function inOpen(x) { if (!o.open) return false; for (var k = 0; k < o.open.length; k++) { var a = U(o.open[k][0]), b = U(o.open[k][1]); if (a > b) { if (x >= a || x <= b) return true; } else if (x >= a && x <= b) return true; } return false; }
  function ridge(baseY, amp, freq, col, rough, seed) {
    var Rr = rng(seed), ph = [Rr() * 6, Rr() * 6, Rr() * 6];
    g.fillStyle = css(col); g.beginPath(); g.moveTo(0, H);
    for (var x = 0; x <= W; x += 4) {
      var t = x / W * Math.PI * 2, y = baseY - amp * (0.55 * Math.sin(t * freq + ph[0]) + 0.3 * Math.sin(t * freq * 2.3 + ph[1]) + 0.15 * Math.sin(t * freq * 5.1 + ph[2]));
      if (rough) y -= rough * Math.abs(Math.sin(t * freq * 13 + ph[2]) * Math.sin(t * freq * 7 + ph[0]));
      if (inOpen(x)) y = H + 10;
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  var far = o.far, near = o.near, kind = o.kind || 'hills';
  if (kind === 'islands') {
    // a few low islands on the sea horizon, each with a soft haze
    for (var i = 0; i < 5; i++) {
      var cx = R() * W, w2 = W * (0.025 + R() * 0.05), hh = 10 + R() * 22, base = H - 40;
      if (inOpen(cx)) continue;
      g.fillStyle = css(mix(far, near, 0.25 + R() * 0.3)); g.beginPath(); g.moveTo(cx - w2, base);
      for (var k = 0; k <= 20; k++) { var t2 = k / 20, x2 = cx - w2 + t2 * 2 * w2; g.lineTo(x2, base - hh * Math.pow(Math.sin(t2 * Math.PI), 0.7) * (0.8 + 0.2 * Math.sin(t2 * 17))); }
      g.closePath(); g.fill();
      if (R() < 0.6) { // a palm or two on top
        g.strokeStyle = css(mix(far, near, 0.5)); g.lineWidth = 1.5; var px = cx + (R() - 0.5) * w2, py = base - hh * 0.8; g.beginPath(); g.moveTo(px, py + 4); g.lineTo(px + 2, py - 9); g.stroke();
      }
    }
  } else {
    // layers from far to near: lighter (hazier) far away
    var layers = kind === 'ridges' ? 3 : 3;
    for (var L = 0; L < layers; L++) {
      var k2 = L / (layers - 1), col = mix(far, near, 0.25 + k2 * 0.55);
      if (kind === 'ridges') ridge(H - 70 + L * 18, 40 - L * 8, 3 + L, col, 22 - L * 6, (o.seed || 1) * 13 + L);
      else ridge(H - 100 + L * 24, 34 - L * 8, 2 + L * 1.5, col, 0, (o.seed || 1) * 7 + L);
    }
    if (kind === 'town') { // a small skyline on two sides of the ground, between the hills
      var Rt = rng((o.seed || 1) * 99);
      [[-0.95, 0.75], [0.6, 1.0], [2.5, 0.55]].forEach(function (cl) {
        var c0 = U(cl[0]), wC = W * 0.06 * cl[1] + W * 0.03, x0 = c0 - wC;
        while (x0 < c0 + wC) {
          var bw = 6 + Rt() * 14, bh = (24 + Rt() * 60) * (1 - Math.abs(x0 - c0) / (wC * 1.4)) * cl[1] + 12, by = H - 40;
          if (!inOpen(x0)) {
            g.fillStyle = css(mix(far, near, 0.55 + Rt() * 0.2)); var xx = ((x0 % W) + W) % W; g.fillRect(xx, by - bh, bw, bh + 40);
            if (Rt() < 0.15) g.fillRect(xx + bw / 2 - 0.6, by - bh - 8, 1.2, 8); // an antenna
            if (o.lights > 0) { g.fillStyle = 'rgba(255,214,140,' + (0.55 * o.lights + 0.2) + ')'; for (var wy = by - bh + 4; wy < by - 2; wy += 5) for (var wx = xx + 2; wx < xx + bw - 2; wx += 4) if (Rt() < 0.28 * o.lights) g.fillRect(wx, wy, 1.6, 2); }
          }
          x0 += bw + Rt() * 2;
        }
      });
    }
    if (kind === 'hills' || kind === 'town') { // trees on the nearest ridge: small bumps
      var Rb = rng((o.seed || 1) * 5);
      g.fillStyle = css(mix(near, 0x000000, 0.12));
      for (var b = 0; b < 140; b++) { var bx = Rb() * W; if (inOpen(bx)) continue; var by2 = H - 32 + (Rb() - 0.5) * 6, br = 2 + Rb() * 3.5; g.beginPath(); g.arc(bx, by2, br, 0, 6.2832); g.fill(); }
    }
  }
  // the bottom fades into the ground haze, so the ring meets the far floor without a seam
  g.globalCompositeOperation = 'source-atop';
  var hz = g.createLinearGradient(0, H - 60, 0, H); hz.addColorStop(0, rgba(o.ground != null ? o.ground : near, 0)); hz.addColorStop(1, rgba(o.ground != null ? o.ground : near, 0.85));
  g.fillStyle = hz; g.fillRect(0, H - 60, W, 60); g.globalCompositeOperation = 'source-over';
  var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 2;
  var geo = new THREE.CylinderGeometry(r, r, hgt, 72, 1, true);
  // cut out (alphaTest) rather than blended: it writes depth, so the sky dome and the stars are not drawn behind it
  var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, fog: false, side: THREE.BackSide, toneMapped: false }));
  m.position.y = (o.y0 || 0) - 1.2 + hgt / 2; m.renderOrder = 49; m.frustumCulled = false; m.name = 'backdrop'; m.userData.glow = false;
  return m;
}
