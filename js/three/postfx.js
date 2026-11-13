// Glow for the 'high' quality tier: a soft halo around the venue's lights and screens (scoreboard,
// floodlight lamps, glowing trim). It is selective and cheap on purpose, so it can run on an iPad:
//
//   1. the scene is drawn to the canvas exactly as without glow (same antialiasing, same tone mapping);
//   2. only the "glow" objects are drawn again into a small target (a quarter of the canvas size);
//   3. that small picture is blurred (two separable passes) and added on top of the canvas.
//
// Glow objects are found by tag(): opaque meshes with an unlit material that opts out of tone mapping
// (MeshBasicMaterial, toneMapped: false) - the usual way to make something look emissive - plus anything with
// userData.glow = true. userData.glow = false keeps a mesh out. They are drawn without occlusion in the small
// pass, which is fine for the far-away lights and screens this is meant for.
//
// Rendering stays on demand: render() is only called when the table has something new to draw, and when glow
// is off the table renders directly, so the low tier pays nothing.
//
// When the quality drops below 'high', enable(false) also frees the two small render targets (iPad memory).
// Older iPads without half-float render targets (WebGL1 without EXT_color_buffer_half_float) get 8-bit targets.
//
// createPostFx(renderer, scene, camera) -> { on, enable(bool), setSize(w, h), tag(), render(), tune({strength}), info(), dispose() }
import * as THREE from 'three';

var LAYER = 5, OCC = 6;
var occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
export var GLOW = { strength: 0.9, scale: 0.25 };

var VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
var BLUR = [
  'uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;',
  'void main() {',
  '  vec4 c = texture2D(tex, vUv) * 0.2270270270;',
  '  c += (texture2D(tex, vUv + dir * 1.3846153846) + texture2D(tex, vUv - dir * 1.3846153846)) * 0.3162162162;',
  '  c += (texture2D(tex, vUv + dir * 3.2307692308) + texture2D(tex, vUv - dir * 3.2307692308)) * 0.0702702703;',
  '  gl_FragColor = c;',
  '}'].join('\n');
var ADD = [
  'uniform sampler2D tex; uniform float strength; varying vec2 vUv;',
  'void main() { gl_FragColor = vec4(texture2D(tex, vUv).rgb * strength, 1.0);', // additive blending is (src * alpha) + dst
  '#include <colorspace_fragment>',
  '}'].join('\n');

export function createPostFx(renderer, scene, camera) {
  var want = false, w = 800, h = 500, rtA = null, rtB = null, quad = null, ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var blurMat = null, addMat = null, glowCount = 0, clr = new THREE.Color();
  function build() {
    if (quad) return;
    var half = true; try { half = renderer.capabilities.isWebGL2 || renderer.extensions.has('EXT_color_buffer_half_float'); } catch (e) {}
    var type = half ? THREE.HalfFloatType : THREE.UnsignedByteType, opt = { type: type, depthBuffer: true, stencilBuffer: false };
    rtA = new THREE.WebGLRenderTarget(4, 4, opt); rtB = new THREE.WebGLRenderTarget(4, 4, { type: type, depthBuffer: false });
    blurMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: BLUR, uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    addMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: ADD, uniforms: { tex: { value: null }, strength: { value: GLOW.strength } }, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat); quad.frustumCulled = false;
    size();
  }
  function size() {
    if (!rtA) return;
    var pr = renderer.getPixelRatio(), gw = Math.max(32, Math.round(w * pr * GLOW.scale)), gh = Math.max(32, Math.round(h * pr * GLOW.scale));
    rtA.setSize(gw, gh); rtB.setSize(gw, gh);
  }
  function pass(mat, src, dst) {
    quad.material = mat; mat.uniforms.tex.value = src.texture;
    renderer.setRenderTarget(dst); renderer.render(quad, ortho);
  }
  var P = {
    get on() { return want && glowCount > 0; },
    enable: function (v) { want = !!v; if (want) { build(); P.tag(); } else if (quad) P.dispose(); },
    setSize: function (W, H) { w = W || w; h = H || h; size(); },
    // (re)find the glow objects and the lights; call after the venue or the creature changes
    // isOccluder(mesh) picks the solid things that should hide a glow behind them (the table, a creature);
    // they are drawn depth-only into the small target first.
    isOccluder: null,
    tag: function () {
      if (!want) return;
      glowCount = 0;
      scene.traverse(function (o) {
        if (o.isLight) { o.layers.enable(LAYER); o.layers.enable(OCC); return; } // same lights in every pass, so no shader rebuilds
        if (!o.isMesh || o.isInstancedMesh) return;
        var m = o.material, g = o.userData && o.userData.glow;
        var glow = g === true || (g !== false && m && !Array.isArray(m) && m.isMeshBasicMaterial && m.toneMapped === false && !m.transparent);
        if (glow) { o.layers.enable(LAYER); glowCount++; } else o.layers.disable(LAYER);
        var occ = !glow && P.isOccluder && !(m && !Array.isArray(m) && m.transparent) && P.isOccluder(o);
        if (occ) o.layers.enable(OCC); else o.layers.disable(OCC);
      });
    },
    render: function () {
      renderer.render(scene, camera);
      var prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha(), bg = scene.background, mask = camera.layers.mask, su = renderer.shadowMap.autoUpdate;
      renderer.getClearColor(clr);
      try {
        // 2. glow objects only, small
        scene.background = null; renderer.shadowMap.autoUpdate = false;
        renderer.setClearColor(0x000000, 0); renderer.autoClear = true; renderer.setRenderTarget(rtA);
        camera.layers.set(OCC); scene.overrideMaterial = occMat; renderer.render(scene, camera); // depth of the occluders
        scene.overrideMaterial = null; renderer.autoClear = false;
        camera.layers.set(LAYER); renderer.render(scene, camera);
        // 3. blur A -> B -> A -> B, the second round wider
        var px = 1 / rtA.width, py = 1 / rtA.height;
        blurMat.uniforms.dir.value.set(px, 0); pass(blurMat, rtA, rtB);
        blurMat.uniforms.dir.value.set(0, py); pass(blurMat, rtB, rtA);
        blurMat.uniforms.dir.value.set(px * 2, 0); pass(blurMat, rtA, rtB);
        blurMat.uniforms.dir.value.set(0, py * 2); pass(blurMat, rtB, rtA);
        // 4. add on top of the canvas
        renderer.setRenderTarget(null); renderer.autoClear = false;
        addMat.uniforms.strength.value = GLOW.strength; pass(addMat, rtA, null);
      } finally {
        scene.overrideMaterial = null; scene.background = bg; camera.layers.mask = mask; renderer.shadowMap.autoUpdate = su;
        renderer.setClearColor(clr, prevAlpha); renderer.autoClear = prevAuto; renderer.setRenderTarget(prevRT);
      }
    },
    count: function () { return glowCount; },
    info: function () { return { on: want && glowCount > 0, glowObjects: glowCount, target: rtA ? rtA.width + 'x' + rtA.height : 'none' }; },
    tune: function (o) { if (o.strength != null) GLOW.strength = o.strength; if (o.scale != null) { GLOW.scale = o.scale; size(); } },
    dispose: function () { if (rtA) { rtA.dispose(); rtB.dispose(); blurMat.dispose(); addMat.dispose(); quad.geometry.dispose(); } rtA = rtB = quad = null; }
  };
  return P;
}
