// Lighting helpers shared by the venues. The table (table.js) owns three lights: a HemisphereLight, the "sun" and the
// "fill" DirectionalLights (the first two DirectionalLights in scene.children). Their colours and strengths come from
// THEMES (environment.js / weather.js); this file decides WHERE the sun and the fill stand, per time of day, so that:
//   - the key (sun) always comes from the front half (z > 0) or the side: the creature's shadow never falls on the Goal
//     row and the cube tops stay lit (golden hour rakes in from the left at ~30 degrees: long shadows, bright tops);
//   - the fill comes from the opposite side, in the complementary colour (warm key, cool fill).
// No light is ever added or removed after a venue is built (that would recompile every shader): a light that has to
// "come on" (the dusk floodlights) is built at a low intensity and ramped.
import * as THREE from 'three';

export var DEFAULT_SUN = [-6, 22, 10], DEFAULT_FILL = [14, 10, -12];

// dirs: [sun, fill] (DirectionalLights); L: a look with sunPos / fillPos, or null for the defaults
export function placeRig(dirs, L) {
  var s = (L && L.sunPos) || DEFAULT_SUN, f = (L && L.fillPos) || DEFAULT_FILL;
  if (dirs[0]) { dirs[0].position.set(s[0], s[1], s[2]); dirs[0].updateMatrixWorld(); }
  if (dirs[1]) { dirs[1].position.set(f[0], f[1], f[2]); dirs[1].updateMatrixWorld(); }
}
// put the table's sun and fill back where they were (felt, space, jungle, ocean, beach, volcano)
export function resetRig() {
  try {
    var sc = window.T3 && window.T3.ctx && window.T3.ctx.scene; if (!sc) return;
    var dirs = sc.children.filter(function (o) { return o.isDirectionalLight; });
    placeRig(dirs, null);
  } catch (e) {}
}

// Phone lights in a dark crowd: a few small, warm-white dots held up by fans. One Points draw call. STATIC (no twinkle).
// pts: crowd positions [{x, y, z}], n: how many, seed.
var dotTex = null;
function dot() {
  if (dotTex) return dotTex;
  var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace; return dotTex;
}
export function phoneLights(pts, n, seed) {
  if (!pts || !pts.length || !n) return null;
  var R = (function (s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })(seed || 9);
  n = Math.min(n, pts.length);
  var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), used = {}, c = new THREE.Color();
  for (var i = 0, k = 0; i < n * 4 && k < n; i++) {
    var j = Math.floor(R() * pts.length); if (used[j]) continue; used[j] = 1;
    var p = pts[j]; pos[k * 3] = p.x + (R() - 0.5) * 0.3; pos[k * 3 + 1] = p.y + 1.25 + R() * 0.35; pos[k * 3 + 2] = p.z;
    c.setHSL(R() < 0.75 ? 0.12 : 0.58, R() < 0.75 ? 0.35 : 0.25, 0.85); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; k++;
  }
  var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  var m = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.34, sizeAttenuation: true, map: dot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  m.renderOrder = 5; m.name = 'phones';
  return m;
}

// Calm mode: the player (or the OS) asked for reduced motion. Camera moves become cuts, light sequences become a switch.
export function calm() {
  try {
    if (window.T3 && window.T3._forceMotion) return false; // test hook (machines with reduced motion switched on)
    if (window.A11y && window.A11y.calm && window.A11y.calm()) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { return false; }
}
