// Weather, time of day and the growing stadium (the 'stadium' and 'night' venues; beach and volcano are unchanged).
//
// GROWING STADIUM. The stadium has 5 tiers that follow the player's progress:
//   stadium points = level() + 2 x (opponents beaten)
//   tier 1: 0-3 points   a small ground: one low stand per side, a few hundred fans, lamp posts, a small scoreboard
//   tier 2: 4-7          a club ground: bigger stands, more fans, floodlight poles, a medium scoreboard
//   tier 3: 8-12         a town stadium: big stands, floodlight towers, the big scoreboard, dugouts
//   tier 4: 13-19        a big stadium (about the old stadium): tall towers, the players' tunnel, flags in his kit colours
//   tier 5: 20+          an arena: two-tier stands all round, a roof ring, four very tall towers, a giant screen,
//                        banners in his kit colours, kit corner flags
//   Trophy banners (one per cup won, one for the crowns) are draped over the front of the back stand at every tier.
//   Force a tier for testing: S.set.stadiumTier = 1..5, or the URL parameter ?tier=1..5.
//
// WEATHER AND TIME OF DAY, chosen per match (deterministic: match number n -> the same weather every time):
//   time: 'day' | 'golden' (sunset) | 'dusk' | 'night' (under floodlights)
//   sky:  'clear' | 'rain' (light) | 'snow' | 'fog'; a rainbow on a clear day straight after a rainy match.
//   S.set.weather: 'auto' (Surprise me, default) | 'clear' (always clear day) | 'golden' | 'dusk' | 'night' | 'rain' |
//   'snow' | 'fog'; false = always clear day (no particles). The 'night' venue is always night.
//   URL for testing: ?time=dusk&sky=rain&rainbow=1
//   Rain and snow are one Points draw call animated in the vertex shader (no per-particle JS), drawn at a capped
//   frame rate (high 20, medium 15, low 10 frames a second) and stopped completely on 'Fast' quality
//   (S.set.quality === 'low'), when S.set.weather === false, or when the tab is hidden. The table, the cubes, the
//   creature and the kid are always kept clear: no particle is drawn over the table column or in front of it.
//
// T3 calls (installed here, like crowd.js does):
//   T3.stadiumTier() -> 1..5            T3.stadiumInfo() -> { tier, points, level, beaten, forced, next }
//   T3.stadiumNews() -> text once when a new tier is reached ('' otherwise); marks S.stadiumTierSeen (persist after)
//   T3.matchWeather() -> { time, sky, rainbow, ambience, line, n }: picks the next match's weather and applies it
//   T3.setWeather({ time, sky, rainbow }) -> applies a weather now (for tests / a Settings preview)
//   T3.weather() -> the weather in use       T3.weatherLine() -> a short line Pip could say about it
import * as THREE from 'three';
import { THEMES, gradientBg } from './environment.js';

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gS() { return typeof window !== 'undefined' && window.S ? window.S : null; }
function urlParam(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }

// ===================================================================== growing stadium
export var TIER_MIN = [0, 0, 4, 8, 13, 20]; // points needed for tier i (index 1..5)
export function stadiumPoints() {
  var S = gS(), L = 1, b = 0;
  try { L = typeof window.level === 'function' ? window.level() : 1; } catch (e) { L = 1; }
  if (S && Array.isArray(S.beaten)) b = S.beaten.filter(Boolean).length;
  return { points: L + 2 * b, level: L, beaten: b };
}
function forcedTier() {
  var S = gS(), u = parseInt(urlParam('tier'), 10), f = S && S.set ? +S.set.stadiumTier : NaN;
  if (u >= 1 && u <= 5) return u;
  if (f >= 1 && f <= 5) return Math.round(f);
  return 0;
}
export function stadiumTier() {
  var f = forcedTier(); if (f) return f;
  var p = stadiumPoints().points, t = 1;
  for (var i = 2; i <= 5; i++) if (p >= TIER_MIN[i]) t = i;
  return t;
}
var NEWS = {
  2: 'Your stadium grew! Bigger stands, more fans and real floodlights.',
  3: 'Your stadium grew again! Big stands, a big scoreboard and dugouts for the teams.',
  4: 'Wow, a big stadium! Tall floodlight towers, a players\' tunnel and flags in your colours.',
  5: 'You built a giant arena! Two-tier stands all round, a roof, a giant screen and banners in your colours!'
};
export function stadiumNews() {
  var S = gS(); if (!S || forcedTier()) return '';
  var t = stadiumTier(), seen = +S.stadiumTierSeen || 1;
  if (t <= seen) { if (!S.stadiumTierSeen) S.stadiumTierSeen = t; return ''; }
  S.stadiumTierSeen = t;
  return NEWS[t] || '';
}

// ===================================================================== weather state
export var TIMES = ['day', 'golden', 'dusk', 'night'], SKIES = ['clear', 'rain', 'snow', 'fog'];
var cur = null, builtSig = '';
function norm(w) {
  w = w || {};
  var o = { time: TIMES.indexOf(w.time) >= 0 ? w.time : 'day', sky: SKIES.indexOf(w.sky) >= 0 ? w.sky : 'clear', rainbow: !!w.rainbow };
  if (o.sky !== 'clear' || o.time === 'night' || o.time === 'dusk') o.rainbow = false;
  return o;
}
// the weather for match number n (prevSky: the sky of match n - 1). Gentle variety: mostly clear days, never two
// grey matches in a row, the very first match is a sunny day.
export function pickFor(n, prevSky) {
  if (n <= 1) return { time: 'day', sky: 'clear', rainbow: false };
  var R = rng(n * 7919 + 17), t = R(), s = R();
  var time = t < 0.5 ? 'day' : t < 0.72 ? 'golden' : t < 0.86 ? 'dusk' : 'night';
  var sky = s < 0.62 ? 'clear' : s < 0.78 ? 'rain' : s < 0.9 ? 'fog' : 'snow';
  if (sky !== 'clear' && (sky === prevSky || (prevSky && prevSky !== 'clear'))) sky = 'clear';
  if (sky === 'snow' && time === 'golden') time = 'day';
  return norm({ time: time, sky: sky, rainbow: sky === 'clear' && prevSky === 'rain' && (time === 'day' || time === 'golden') });
}
var CHOICE = { clear: { time: 'day', sky: 'clear' }, golden: { time: 'golden', sky: 'clear' }, dusk: { time: 'dusk', sky: 'clear' }, night: { time: 'night', sky: 'clear' }, rain: { time: 'day', sky: 'rain' }, snow: { time: 'day', sky: 'snow' }, fog: { time: 'day', sky: 'fog' } };
function choiceOf(set) { return set === false ? 'clear' : (set && CHOICE[set] ? set : 'auto'); }
function urlWeather() {
  var t = urlParam('time'), s = urlParam('sky'), r = urlParam('rainbow');
  if (!t && !s && !r) return null;
  return norm({ time: t, sky: s, rainbow: r === '1' });
}
export function currentWeather() {
  var u = urlWeather(); if (u) return u;
  if (!cur) { var S = gS(); cur = norm(S && S.wx && S.wx.cur ? S.wx.cur : null); }
  return cur;
}
export function ambienceOf(w) { return w.sky === 'rain' ? 'rain' : w.sky === 'snow' || w.sky === 'fog' ? 'wind' : ''; }
export function weatherLine(w) {
  w = w || currentWeather();
  var mat = gS() && gS().cos ? gS().cos.mat : 'stadium';
  if (mat !== 'stadium' && mat !== 'night') return '';
  if (w.sky === 'rain') return 'A soft rain is falling. Don\'t worry, our table stays nice and dry!';
  if (w.sky === 'snow') return 'Snow at the stadium! Look, the stands are all white.';
  if (w.sky === 'fog') return 'Foggy today! The far stands are hiding in the mist.';
  if (w.rainbow) return 'The rain stopped. Look, a rainbow over the stadium!';
  var t = mat === 'night' ? 'night' : w.time;
  return t === 'golden' ? 'A sunset match! Everything is golden.' : t === 'dusk' ? 'The floodlights are coming on for an evening match.' : t === 'night' ? 'A night match under the floodlights!' : 'A sunny day at the stadium!';
}

// ===================================================================== looks per time of day (THEMES.stadium)
// The table reads the lights, the sky gradient and the fog from THEMES[mat] when it builds the table; the same
// numbers are pushed into the live scene here so a new weather shows without waiting for a rebuild.
var LOOK = {
  day:    { sun: 0xfff4e2, sunI: 2.25, fill: 0xb8d0ff, fillI: 0.5, sky: 0xdcecff, ground: 0x2c5a2c, hemiI: 0.72, env: 0.48, bg: ['#5aa6e6', '#cfe7fa'], fog: [0xbdd6ea, 70, 200],
            dome: [0x3d8fe0, 0xbfe0fa, 0x5d8a5a], glowI: 0.28, dim: 1 },
  golden: { sun: 0xffb466, sunI: 2.1, fill: 0x9a8cff, fillI: 0.42, sky: 0xffcf98, ground: 0x3b3a26, hemiI: 0.62, env: 0.42, bg: ['#41549c', '#ffb36e'], fog: [0xe4a476, 64, 180],
            dome: [0x46589e, 0xffb06a, 0x4d5a3a], glowI: 0.5, dim: 0.93 },
  dusk:   { sun: 0xffb895, sunI: 1.3, fill: 0x8090ff, fillI: 0.5, sky: 0xa3a6dc, ground: 0x1b2a24, hemiI: 0.46, env: 0.3, bg: ['#1d2352', '#c7706c'], fog: [0x3b2f52, 58, 160],
            dome: [0x161c48, 0xc9726a, 0x1d2a22], glowI: 0.8, dim: 0.62 },
  night:  { sun: 0xf0f5ff, sunI: 1.15, fill: 0x7d96ff, fillI: 0.35, sky: 0x8ea4d8, ground: 0x0b1d12, hemiI: 0.22, env: 0.2, bg: ['#040818', '#000105'], fog: [0x030714, 55, 140],
            dome: [0x02040e, 0x0b1430, 0x05080c], glowI: 0.9, dim: 0.34 }
};
function mixHex(a, b, k) { return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex(); }
function mixCss(a, b, k) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString(); }
// the full look: time of day with the sky's change on top
export function lookFor(w, mat) {
  var night = mat === 'night', t = night ? 'night' : w.time, L = JSON.parse(JSON.stringify(LOOK[t])), dark = t === 'night' || t === 'dusk';
  if (w.sky === 'rain') {
    L.sunI *= 0.62; L.hemiI *= 0.95; L.env *= 0.9; L.dim *= 0.9;
    L.sky = mixHex(L.sky, 0x9aa6b4, 0.6); L.sun = mixHex(L.sun, 0xd6dde6, 0.6);
    L.fog = [mixHex(L.fog[0], dark ? 0x1a2230 : 0x8d99a8, 0.75), L.fog[1] - 6, L.fog[2] - 40];
    L.bg = [mixCss(L.bg[0], dark ? '#141a26' : '#6f7c8c', 0.7), mixCss(L.bg[1], dark ? '#202838' : '#a9b4c0', 0.7)];
    L.dome = [mixHex(L.dome[0], dark ? 0x10151f : 0x6a7684, 0.75), mixHex(L.dome[1], dark ? 0x1e2533 : 0xaab4c0, 0.7), L.dome[2]];
  } else if (w.sky === 'snow') {
    L.sunI *= 0.72; L.hemiI *= 1.1; L.dim *= 0.95;
    L.sky = mixHex(L.sky, 0xe8eef6, 0.6); L.ground = mixHex(L.ground, 0xc8d2dc, 0.6); L.sun = mixHex(L.sun, 0xeef2f8, 0.6);
    L.fog = [mixHex(L.fog[0], dark ? 0x232a38 : 0xdde4ec, 0.75), L.fog[1] - 8, L.fog[2] - 45];
    L.bg = [mixCss(L.bg[0], dark ? '#1a2030' : '#b8c4d2', 0.7), mixCss(L.bg[1], dark ? '#2a3242' : '#eef2f6', 0.7)];
    L.dome = [mixHex(L.dome[0], dark ? 0x141a26 : 0xa9b6c6, 0.75), mixHex(L.dome[1], dark ? 0x2a3242 : 0xeef2f6, 0.7), mixHex(L.dome[2], 0xdfe6ee, 0.8)];
  } else if (w.sky === 'fog') {
    L.sunI *= 0.75; L.dim *= 0.95;
    L.sky = mixHex(L.sky, 0xc4ccd4, 0.5);
    L.fog = [mixHex(L.fog[0], dark ? 0x2a3040 : 0xc2cad2, 0.85), 0, 45]; // near is set from the seat distance, far = near + 45
    L.bg = [mixCss(L.bg[0], dark ? '#262c3a' : '#b4bcc6', 0.8), mixCss(L.bg[1], dark ? '#323a48' : '#d4dae0', 0.8)];
    L.dome = [mixHex(L.dome[0], dark ? 0x232a36 : 0xaeb8c2, 0.85), mixHex(L.dome[1], dark ? 0x2e3644 : 0xd0d6dc, 0.85), mixHex(L.dome[2], dark ? 0x202630 : 0xb0b8c0, 0.7)];
  }
  L.time = t; L.dark = dark; L.sky0 = w.sky;
  return L;
}
// write a look into THEMES[mat] (in place: the table keeps a reference to it for dimming) and into the live scene
export function applyLook(w, mat) {
  if (mat !== 'stadium' && mat !== 'night') return;
  var L = lookFor(w, mat), T = THEMES[mat];
  if (mat === 'stadium') ['sun', 'sunI', 'fill', 'fillI', 'sky', 'ground', 'hemiI', 'env', 'bg'].forEach(function (k) { T[k] = L[k]; });
  var near = L.fog[1];
  if (w.sky === 'fog') { // dense, but never over the table: it starts a little beyond the seat camera's distance to the table
    var d = 32; try { var cb = window.T3.ctx.camBase; d = cb.pos.distanceTo(cb.look); } catch (e) {}
    near = Math.max(28, d + 5);
  }
  var far = w.sky === 'fog' ? near + L.fog[2] : L.fog[2];
  if (mat === 'stadium') T.fog = [L.fog[0], near, far];
  else T.fog = w.sky === 'fog' ? [L.fog[0], near, far] : (w.sky === 'clear' ? [0x030714, 55, 140] : [L.fog[0], 50, 120]);
  var ctx = window.T3 && window.T3.ctx, scene = ctx && ctx.scene; if (!scene) return;
  var dirs = [];
  scene.children.forEach(function (o) {
    if (o.isHemisphereLight) { o.color.setHex(T.sky); o.groundColor.setHex(T.ground); o.intensity = T.hemiI; }
    else if (o.isDirectionalLight) dirs.push(o);
  });
  if (dirs[0]) { dirs[0].color.setHex(T.sun); dirs[0].intensity = T.sunI; }
  if (dirs[1]) { dirs[1].color.setHex(T.fill); dirs[1].intensity = T.fillI; }
  scene.environmentIntensity = T.env;
  if (scene.fog && T.fog) { scene.fog.color.setHex(T.fog[0]); scene.fog.near = T.fog[1]; scene.fog.far = T.fog[2]; }
  if (scene.background && scene.background.isTexture) { var old = scene.background; scene.background = gradientBg(T.bg); old.dispose(); }
}

// ===================================================================== applying a weather
function venueMat() { var S = gS(); return S && S.cos ? S.cos.mat : ''; }
export function buildSig(mat, w, tier) { return mat + '|' + tier + '|' + (mat === 'night' ? 'night' : w.time) + '|' + w.sky + '|' + (w.rainbow ? 1 : 0); }
export function noteBuilt(sig) { builtSig = sig; }
export function setWeather(w, quiet) {
  cur = norm(w);
  var S = gS();
  if (S) { if (!S.wx || typeof S.wx !== 'object') S.wx = { n: 0 }; S.wx.cur = { time: cur.time, sky: cur.sky, rainbow: cur.rainbow }; }
  var mat = venueMat(), w2 = currentWeather();
  applyLook(w2, mat);
  // the stadium details (wet pitch, snow, night lights, rainbow, tier) are built with the venue: rebuild if they differ
  var T3 = window.T3;
  if (!quiet && (mat === 'stadium' || mat === 'night') && T3 && T3.ctx && T3.ctx.layout && T3.retheme && builtSig && builtSig !== buildSig(mat, w2, stadiumTier())) T3.retheme();
  else if (T3 && T3.kick) T3.kick();
  return w2;
}
// the next match's weather (call once per match, at its start)
export function matchWeather() {
  var S = gS(), choice = choiceOf(S && S.set ? S.set.weather : 'auto'), w;
  if (S) { if (!S.wx || typeof S.wx !== 'object') S.wx = { n: 0 }; }
  var wx = S ? S.wx : { n: 0 }, prev = wx.cur ? wx.cur.sky : 'clear';
  wx.n = (wx.n || 0) + 1;
  w = choice === 'auto' ? pickFor(wx.n, prev) : norm(CHOICE[choice]);
  var out = setWeather(w);
  return { time: venueMat() === 'night' ? 'night' : out.time, sky: out.sky, rainbow: out.rainbow, ambience: ambienceOf(out), line: weatherLine(out), n: wx.n };
}

// ===================================================================== scenery pieces used by stadium.js
// A sky dome (gradient by height, a sun glow, stars at night). depthWrite off: never in the camera's way.
export function skyDome(L) {
  var g = new THREE.SphereGeometry(165, 32, 16);
  var m = new THREE.ShaderMaterial({
    uniforms: { cTop: { value: new THREE.Color(L.dome[0]) }, cHor: { value: new THREE.Color(L.dome[1]) }, cLow: { value: new THREE.Color(L.dome[2]) },
      sunDir: { value: new THREE.Vector3(-0.55, L.time === 'golden' ? 0.08 : L.time === 'dusk' ? 0.02 : 0.5, -0.83).normalize() },
      sunCol: { value: new THREE.Color(L.time === 'golden' ? 0xffc070 : L.time === 'dusk' ? 0xff8a70 : 0xfff6dd) },
      sunK: { value: L.time === 'night' || L.sky0 !== 'clear' ? 0.0 : L.time === 'day' ? 0.35 : 0.8 }, stars: { value: L.time === 'night' && L.sky0 === 'clear' ? 1.0 : L.time === 'dusk' && L.sky0 === 'clear' ? 0.35 : 0.0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 cTop; uniform vec3 cHor; uniform vec3 cLow; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunK; uniform float stars; varying vec3 vD;\n' +
      'float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }\n' +
      'void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(cHor, cTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(cHor, cLow, clamp(-y * 6.0, 0.0, 1.0));\n' +
      '  float s = max(dot(vD, sunDir), 0.0); c += sunCol * sunK * (pow(s, 24.0) * 0.9 + pow(s, 3.0) * 0.25);\n' +
      '  if (stars > 0.0 && y > 0.05) { vec3 q = floor(vD * 180.0); float r = h(q); c += vec3(0.9, 0.93, 1.0) * stars * step(0.9965, r) * (0.5 + 0.5 * h(q + 3.1)) * smoothstep(0.05, 0.3, y); }\n' +
      '  gl_FragColor = vec4(c, 1.0); }',
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
  });
  var dome = new THREE.Mesh(g, m); dome.renderOrder = -20; dome.frustumCulled = false; dome.name = 'sky';
  return dome;
}
// A soft rainbow arc far behind the back stand (static)
export function rainbow(FY, zBack) {
  var g = new THREE.RingGeometry(78, 88, 72, 1, 0.12, Math.PI - 0.24);
  var m = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: 'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vR; void main(){ float k = clamp((vR - 78.0) / 10.0, 0.0, 1.0);\n' +
      '  vec3 c = k < 0.2 ? mix(vec3(0.55,0.3,0.9), vec3(0.25,0.45,1.0), k / 0.2) : k < 0.4 ? mix(vec3(0.25,0.45,1.0), vec3(0.25,0.85,0.45), (k - 0.2) / 0.2) : k < 0.6 ? mix(vec3(0.25,0.85,0.45), vec3(1.0,0.9,0.3), (k - 0.4) / 0.2) : k < 0.8 ? mix(vec3(1.0,0.9,0.3), vec3(1.0,0.55,0.2), (k - 0.6) / 0.2) : mix(vec3(1.0,0.55,0.2), vec3(0.95,0.25,0.25), (k - 0.8) / 0.2);\n' +
      '  float a = smoothstep(0.0, 0.12, k) * smoothstep(1.0, 0.85, k) * 0.38; gl_FragColor = vec4(c, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide
  });
  var r = new THREE.Mesh(g, m); r.position.set(-12, FY - 22, zBack - 70); r.rotation.y = 0.12; r.renderOrder = -15; r.name = 'rainbow';
  return r;
}

// ===================================================================== rain and snow
// o = { kind: 'rain' | 'snow', box: { x0, x1, z0, z1, y0, y1 }, clear: { hw, hd0, hd1 } (the table + people, kept
// clear), quality() , night }. Returns { points, step(now) -> bool, running(), stats(), dispose() }.
var VS = [
  'uniform float uTime; uniform vec2 uRes; uniform float uSpeed; uniform float uSway; uniform float uLen; uniform float uSize;',
  'uniform vec2 uY; uniform vec4 uClear; uniform float uRain;',
  'attribute vec2 seed;',
  'varying vec2 vDir; varying float vL; varying float vW; varying float vSz; varying float vA;',
  'void main(){',
  '  float sp = uSpeed * (0.8 + 0.4 * seed.y), H = uY.y - uY.x;',
  '  float y = uY.x + H * fract(seed.x - uTime * sp / H);',
  '  float ph = seed.y * 40.0, f = 0.5 + seed.y;',
  '  vec3 p = vec3(position.x + sin(uTime * 0.11 * f + ph) * uSway, y, position.z + cos(uTime * 0.09 * f + ph * 1.7) * uSway);',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  float a = smoothstep(0.0, 1.5, y - uY.x) * smoothstep(0.0, 2.0, uY.y - y);',  // fade in at the top, out at the ground
  '  a *= smoothstep(2.5, 7.0, -mv.z);',                                            // nothing right in front of the lens
  // the table column (and the creature and the kid beside it) stays dry ...
  '  vec2 e = vec2(abs(p.x) - uClear.x, max(uClear.y - p.z, p.z - uClear.z));',
  '  a *= smoothstep(0.0, 1.5, max(e.x, e.y));',
  // ... and nothing is drawn in front of it: hide a particle whose line of sight from the camera lands on it
  '  vec3 c = cameraPosition;',
  '  if (p.y > -0.6 && p.y < c.y - 0.05) { float s = c.y / (c.y - p.y); vec3 hit = c + (p - c) * s;',
  '    vec2 e2 = vec2(abs(hit.x) - uClear.x, max(uClear.y - hit.z, hit.z - uClear.z)); a *= smoothstep(0.0, 2.0, max(e2.x, e2.y)); }',
  '  vA = a;',
  '  vec4 c0 = projectionMatrix * mv;',
  '  if (a < 0.01 || mv.z > -0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vDir = vec2(0.0); vL = 0.0; vW = 0.0; vSz = 1.0; return; }',
  '  float ppu = uRes.y * 0.5 * projectionMatrix[1][1] / -mv.z;',                  // pixels per world unit at this depth
  '  if (uRain > 0.5) {',
  '    vec4 c1 = projectionMatrix * modelViewMatrix * vec4(p - vec3(0.0, uLen, 0.0), 1.0);',
  '    vec2 d = (c1.xy / max(c1.w, 0.01) - c0.xy / c0.w) * uRes * 0.5; float L = length(d);',
  '    vDir = L > 0.001 ? vec2(d.x, -d.y) / L : vec2(0.0, 1.0); vL = min(L, 60.0); vW = max(1.0, uSize * ppu);',
  '    vSz = vL + vW * 2.0 + 2.0;',
  '  } else { vDir = vec2(0.0, 1.0); vW = clamp(uSize * ppu, 1.6, 16.0); vL = 0.0; vSz = vW + 2.0; }',
  '  gl_PointSize = vSz; gl_Position = c0;',
  '}'
].join('\n');
var FS = [
  'uniform vec3 uColor; uniform float uAlpha; uniform float uRain;',
  'varying vec2 vDir; varying float vL; varying float vW; varying float vSz; varying float vA;',
  'void main(){',
  '  vec2 q = (gl_PointCoord - 0.5) * vSz; float a;',
  '  if (uRain > 0.5) { float al = dot(q, vDir), ac = dot(q, vec2(-vDir.y, vDir.x));',
  '    a = (1.0 - smoothstep(vL * 0.5 - 0.5, vL * 0.5 + 1.0, abs(al))) * (1.0 - smoothstep(vW * 0.5, vW * 0.5 + 0.9, abs(ac)));',
  '    a *= 0.45 + 0.55 * clamp(0.5 + al / max(vL, 1.0), 0.0, 1.0);',
  '  } else { a = 1.0 - smoothstep(vW * 0.22, vW * 0.5, length(q)); }',
  '  a *= uAlpha * vA; if (a < 0.01) discard;',
  '  gl_FragColor = vec4(uColor, a);',
  '}'
].join('\n');
export var WX_COUNTS = { rain: [450, 1000, 1800], snow: [350, 800, 1400] }; // by quality level 0 (auto low), 1, 2
var WX_FPS = [10, 15, 20];
export function particlesOff() { var S = gS(); return !!(S && S.set && (S.set.quality === 'low' || S.set.weather === false)); }
export function makeParticles(o) {
  var rain = o.kind === 'rain', q = o.quality ? o.quality() : 2, lv = q >= 2 ? 2 : q >= 1 ? 1 : 0, n = WX_COUNTS[o.kind][lv], b = o.box, cl = o.clear, R = rng(rain ? 51 : 77);
  var pos = new Float32Array(n * 3), sd = new Float32Array(n * 2), k = 0, tries = 0;
  while (k < n && tries < n * 20) {
    tries++;
    var x = b.x0 + R() * (b.x1 - b.x0), z = b.z0 + R() * (b.z1 - b.z0);
    if (Math.abs(x) < cl.hw + 1.5 && z > cl.hd0 - 1.5 && z < cl.hd1 + 1.5) continue; // never over the table
    pos[k * 3] = x; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = z; sd[k * 2] = R(); sd[k * 2 + 1] = R(); k++;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(sd, 2));
  geo.setDrawRange(0, k);
  var mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 800) }, uSpeed: { value: rain ? 7.0 : 0.65 }, uSway: { value: rain ? 0.12 : 0.55 },
      uLen: { value: 0.9 }, uSize: { value: rain ? 0.035 : 0.1 }, uY: { value: new THREE.Vector2(b.y0, b.y1) }, uClear: { value: new THREE.Vector4(cl.hw, cl.hd0, cl.hd1, 0) },
      uRain: { value: rain ? 1 : 0 }, uColor: { value: new THREE.Color(rain ? (o.night ? 0xc8d6ee : 0xd8e0ea) : 0xffffff) }, uAlpha: { value: rain ? (o.night ? 0.5 : 0.42) : 0.85 }
    },
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false
  });
  var pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 6; pts.name = 'weather:' + o.kind;
  var t0 = -1, last = -1e9, clock = 0, prevNow = 0, frames = 0, gap = 1000 / WX_FPS[lv] - 5, size = new THREE.Vector2();
  function on() { return !particlesOff() && !(typeof document !== 'undefined' && document.hidden); }
  var api = {
    points: pts, count: k,
    running: on,
    // called every animation frame by the venue; true when a weather frame should be drawn (the capped rate)
    step: function (now) {
      var run = on();
      if (pts.visible !== run) { pts.visible = run; if (!run) { prevNow = 0; return true; } } // one last frame without them
      if (!run) return false;
      var dt = prevNow ? Math.min(0.1, (now - prevNow) / 1000) : 0; prevNow = now; clock += dt; // a clock that cannot jump
      if (now - last < gap) return false;
      last = now; frames++;
      mat.uniforms.uTime.value = clock;
      try { window.T3.ctx.renderer.getDrawingBufferSize(size); mat.uniforms.uRes.value.copy(size); } catch (e) {}
      return true;
    },
    stats: function () { return { kind: o.kind, particles: k, fps: WX_FPS[lv], frames: frames, running: on() }; },
    dispose: function () { geo.dispose(); mat.dispose(); }
  };
  return api;
}
// Low banks of mist round the stands for foggy matches (static soft sprites, depthWrite off)
var mistTex = null;
export function mistBanks(g, R, pts2, color) {
  if (!mistTex) {
    var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    mistTex = new THREE.CanvasTexture(c); mistTex.colorSpace = THREE.SRGBColorSpace;
  }
  var mat = new THREE.SpriteMaterial({ map: mistTex, color: color, transparent: true, opacity: 0.32, depthWrite: false, fog: true });
  pts2.forEach(function (p) { var s = new THREE.Sprite(mat); s.position.set(p[0], p[1], p[2]); s.scale.set(p[3], p[3] * 0.32, 1); s.renderOrder = 2; g.add(s); });
}

// ===================================================================== T3 calls
function install() {
  if (typeof window === 'undefined' || !window.T3 || window.T3.stadiumTier) return;
  var T3 = window.T3;
  T3.stadiumTier = stadiumTier;
  T3.stadiumInfo = function () { var p = stadiumPoints(), t = stadiumTier(); return { tier: t, points: p.points, level: p.level, beaten: p.beaten, forced: !!forcedTier(), next: t < 5 ? TIER_MIN[t + 1] : null }; };
  T3.stadiumNews = stadiumNews;
  T3.matchWeather = matchWeather;
  T3.setWeather = function (w) { return setWeather(w); };
  T3.weather = function () { var w = currentWeather(); return { time: venueMat() === 'night' ? 'night' : w.time, sky: w.sky, rainbow: w.rainbow, ambience: ambienceOf(w), particles: !particlesOff() }; };
  T3.weatherLine = function () { return weatherLine(); };
}
install();
