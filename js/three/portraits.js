// Head-and-shoulders pictures of the creatures, for the sticker-card album (js/cards.js).
//
//   T3.portrait(kind, pack, size) -> a PNG data URL when the picture is already made,
//                                    otherwise a Promise of one (or of null when it cannot be made).
//     kind: sloth penguin fox owl wizard pip    pack: 'classic' | 'monsters'    size: pixels (square, default 256, max 512)
//   T3.portraitReady(kind, pack, size) -> the data URL if it is cached, else null (never starts any work)
//
// Each picture is drawn once, with the main renderer into an offscreen render target (no second WebGL context),
// then cached for the rest of the session. Requests are queued and drawn one at a time with a short gap, so opening
// the album never stalls the page. When 3D is unavailable (no T3.ctx) nothing is installed and the cards keep their emoji.
import * as THREE from 'three';
import { buildClassic } from './creatures/classic.js';
import { MonstersPack } from './creatures/gltfpack.js';

var T3 = window.T3;
if (T3 && T3.ctx) (function () {
  var ctx = T3.ctx, cache = {}, queue = [], busy = false, scene = null, cam = null;

  function key(kind, pack, size) { return kind + '|' + pack + '|' + size; }
  function stage() {
    if (scene) return;
    scene = new THREE.Scene();
    // softer than the table's lights: the picture is not tone mapped (that only happens on screen)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6f7f99, 0.75));
    var key1 = new THREE.DirectionalLight(0xffffff, 1.7); key1.position.set(-3, 6, 9); scene.add(key1);
    var rim = new THREE.DirectionalLight(0xfff1d6, 0.8); rim.position.set(5, 4, -6); scene.add(rim);
    cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  }
  // a calm, friendly resting pose (every field the packs read)
  function neutralP() {
    return { breath: 0, breathAmp: 1, lean: -0.05, hop: 0, slide: 0, turn: 0, sway: 0, headYaw: 0, headPitch: -0.06, headRoll: 0, eyeX: 0, eyeY: 0.15, eyeAddX: 0, eyeAddY: 0,
      lid: 0.95, blink: 0, lidAsym: 0, browRaise: 0.15, browTilt: 0, browAsym: 0, smile: 0.55, open: 0, shrug: 0, happyAmt: 0.25, sadAmt: 0, dt: 0.016,
      rx: 0, ry: 0, rz: 0, rYaw: 0, rScale: 1, eyeWide: 0, pupil: 0, mouthW: 1, sweat: 0, sweatT: 0, gulp: 0, earL: 0, earR: 0, earUp: 0, hatTilt: 0, hatLift: 0, armRate: 9,
      gazeThink: 0, gazeSad: 0, gazeCam: 1, cry: 0, cryT: 0, steam: 0, steamT: 0, angry: 0, pitchAdd: 0, tailLift: 0, beardSway: 0, talk: 0, talkT: 0, task: 0 };
  }
  // classic creatures own everything they are made of. A glTF monster shares its geometry and base texture with the
  // copy that may be standing at the table right now, so only its own materials are released (freeing the shared
  // buffers would make the live creature upload them again: a hitch for nothing).
  function dispose(root, pack) {
    var own = pack !== 'monsters';
    root.traverse(function (o) {
      if (own && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (own && m.map) m.map.dispose(); m.dispose(); });
    });
  }
  function build(kind, pack) {
    if (pack === 'monsters') {
      if (!MonstersPack.available || !MonstersPack.has(kind)) return Promise.resolve(null);
      return MonstersPack.load(kind).then(function () { return MonstersPack.build(kind); });
    }
    return Promise.resolve(buildClassic(kind));
  }

  // put the creature in the portrait scene, in its resting pose, and aim the camera
  function pose(actor) {
    stage();
    var r = ctx.renderer, P = neutralP(), tmp = new THREE.Vector3(), pc = actor.portrait || {};
    P.lean += actor.lean || 0; if (pc.pitch) P.headPitch += pc.pitch;
    scene.add(actor.root); actor.root.position.set(0, 0, 0); actor.root.updateMatrixWorld(true);
    actor.apply(P, 0);
    for (var i = 0; i < 2; i++) {
      var a = actor.arms[i], rest = a.rest || new THREE.Vector3(a.side * 1.75, 0.2, 1.45);
      a.open = 0.35; tmp.copy(rest); tmp.y -= 0.4; tmp.applyMatrix4(actor.invBody); a.solve(tmp.x, tmp.y, tmp.z, 0.55, 0);
    }
    actor.root.updateMatrixWorld(true);
    // frame: from just under the shirt number up to the top of the head (ears, hat, horns), centred on the head
    var head = new THREE.Vector3();
    if (actor.headObj) actor.headObj.getWorldPosition(head); else head.copy(actor.headC);
    // (a pack may tune it: portrait.top = extra room above actor.top, portrait.bottom = fraction of the head height,
    // portrait.pitch = head nod, portrait.elev = how far above the head the camera sits)
    var top = actor.top + (pc.top != null ? pc.top : 0.12), bottom = head.y * (pc.bottom != null ? pc.bottom : 0.42), h = top - bottom, cy = (top + bottom) / 2;
    var dist = (h / 2) / Math.tan(cam.fov * Math.PI / 360) * 1.16;
    var el = pc.elev != null ? pc.elev : 0.16;                    // camera height: a little above eye level (a pack may look down more)
    cam.position.set(head.x, cy + dist * el, head.z + dist); cam.lookAt(head.x, cy, head.z * 0.4); cam.updateMatrixWorld();
    scene.environment = ctx.scene.environment || null;
  }
  // draw into an offscreen target, put the renderer back exactly as it was, then read the pixels back
  // (asynchronously where WebGL2 allows it, so the page never waits on the GPU) and encode a PNG
  function shoot(actor, size, pack) {
    var r = ctx.renderer, rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, type: THREE.UnsignedByteType });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    var prev = r.getRenderTarget(), cc = new THREE.Color(), ca = r.getClearAlpha(), sh = r.shadowMap.enabled, px = new Uint8Array(size * size * 4);
    r.getClearColor(cc);
    function cleanup() { rt.dispose(); if (actor.root.parent === scene) scene.remove(actor.root); if (actor.dispose) actor.dispose(); dispose(actor.root, pack); }
    var read;
    try {
      r.shadowMap.enabled = false; r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
      read = r.readRenderTargetPixelsAsync ? r.readRenderTargetPixelsAsync(rt, 0, 0, size, size, px) : (r.readRenderTargetPixels(rt, 0, 0, size, size, px), Promise.resolve(px));
    } catch (e) { read = Promise.reject(e); }
    finally { r.setRenderTarget(prev); r.setClearColor(cc, ca); r.shadowMap.enabled = sh; if (ctx.dirty) ctx.dirty(); }
    return read.then(function () {
      var cv = document.createElement('canvas'); cv.width = cv.height = size; var g = cv.getContext('2d'), img = g.createImageData(size, size), row = size * 4;
      for (var y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * row, (size - y) * row), y * row);   // GL rows are bottom-up
      g.putImageData(img, 0, 0); cleanup(); return cv.toDataURL('image/png');
    }, function (e) { cleanup(); throw e; });
  }

  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    var job = queue.shift();
    var ready = job.pack === 'monsters' ? MonstersPack.probe() : Promise.resolve(true);
    var actor = null;
    ready.then(function () { return build(job.kind, job.pack); })
      .then(function (a) {
        actor = a; if (!a) return null;
        pose(a);
        // compile its shaders off the main thread where the browser can (KHR_parallel_shader_compile), then draw
        var r = ctx.renderer;
                // (three r170's compileAsync throws from its own timer when a material ends up without a program, so warm up with the plain compile)
        try { if (r.compile) r.compile(scene, cam); } catch (e) {}
        var ready = Promise.resolve();
        return ready.then(function () { return shoot(a, job.size, job.pack); });
      })
      .catch(function (e) { console.warn('portrait', job.kind, job.pack, e); if (actor && actor.root.parent === scene) scene.remove(actor.root); return null; })
      .then(function (url) {
        cache[job.k] = url; job.done(url);
        busy = false; setTimeout(pump, 60);                       // one picture at a time, with a breather in between
      });
  }

  T3.portraitReady = function (kind, pack, size) {
    var v = cache[key(kind || 'pip', pack === 'monsters' ? 'monsters' : 'classic', Math.max(64, Math.min(512, size | 0 || 256)))];
    return typeof v === 'string' ? v : null;
  };
  T3.portrait = function (kind, pack, size) {
    kind = kind || 'pip'; pack = pack === 'monsters' ? 'monsters' : 'classic'; size = Math.max(64, Math.min(512, size | 0 || 256));
    var k = key(kind, pack, size), v = cache[k];
    if (typeof v === 'string') return v;
    if (v === null) return Promise.resolve(null);
    if (v && v.then) return v;
    var p = new Promise(function (res) { queue.push({ k: k, kind: kind, pack: pack, size: size, done: res }); });
    cache[k] = p; setTimeout(pump, 0);
    return p;
  };
})();
