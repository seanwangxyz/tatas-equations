// The "monsters" pack: glTF characters (Quaternius "Bestiary - Dungeon Monsters Kit", humanoid rig) described by
// assets/creatures/monsters/manifest.json. Format documented in assets/creatures/README.md.
//
// If the manifest (or every file in it) is missing the pack simply reports available:false and the game uses classic.
// GLTFLoader / SkeletonUtils are imported lazily so a failed CDN fetch can never break the classic creatures.
//
// The models ship without animation clips, so they are driven procedurally (monsterrig.js): breathing, gaze, moods, and
// arms that reach with real two-bone IK on the model's own arm bones. One .glb can serve several slots: a slot may point
// at a different base-colour texture ("baseColor") and tint it ("tint"). The soccer kit (fitted jersey + scarf) is built
// from the model's own torso at load time (monsterwear.js). If a manifest "animations" file (e.g. the Universal Animation
// Library) and "clips" are present, the clips drive the skeleton instead and the rig only adds gaze and reaches on top.
import * as THREE from 'three';
import { TEAM, clamp } from './common.js';
import { STYLE, NUM_BIG } from './classic.js';
import { MonsterRig, BONE_NAMES } from './monsterrig.js';
import { buildJerseyData, makeJerseyMesh, makeScarf, makeArmband } from './monsterwear.js';

const MANIFEST = 'assets/creatures/monsters/manifest.json';
const DEFAULT_CLIPS = {
  idle: ['Idle_Loop', 'Idle', 'idle'],
  think: ['Idle_Talking', 'Talking', 'think', 'Thinking'],
  happy: ['Victory', 'Cheer', 'Celebrate', 'Happy', 'Dance', 'Wave', 'Jump'],
  sad: ['Defeat', 'Sad', 'Hit', 'Death', 'Hurt', 'Sit'],
  challenge: ['Taunt', 'Point', 'Roar', 'Attack', 'Punch', 'Yell'],
  wave: ['Wave', 'Hello']
};
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _box = new THREE.Box3();

function matchName(name, pat) {
  if (!pat) return false;
  if (typeof pat === 'string' && pat[0] === '/') { const i = pat.lastIndexOf('/'); try { return new RegExp(pat.slice(1, i), pat.slice(i + 1) || 'i').test(name); } catch (e) { return false; } }
  return name.toLowerCase().indexOf(String(pat).toLowerCase()) >= 0;
}
function matchAny(name, pats) { return (pats || []).some((p) => matchName(name, p)); }
const exists = async (url, memo) => { if (memo[url] === undefined) memo[url] = (async () => { try { const h = await fetch(url, { method: 'HEAD' }); return h.ok || h.status === 405 || h.status === 501; } catch (e) { return false; } })(); return memo[url]; };

export const MonstersPack = {
  id: 'monsters', name: 'Monsters', available: false, settled: false, manifest: null, slots: {}, cache: {}, tex: {}, clipLib: null, _mods: null, _loading: {},

  // Fetch the manifest and check which model files exist. Resolves true if the pack is usable.
  probe() {
    if (this._probe) return this._probe;
    this._probe = (async () => {
      try {
        const url = new URL(MANIFEST, document.baseURI), r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) return false;
        const man = await r.json();
        if (!man || !man.slots || typeof man.slots !== 'object') return false;
        const base = new URL('.', url).href, def = man.defaults || {}, memo = {};
        for (const k of Object.keys(man.slots)) {
          const s = Object.assign({}, def, man.slots[k]); if (!s.file) continue;
          s.url = new URL(s.file, base).href;
          if (!(await exists(s.url, memo))) continue;
          if (s.baseColor) { s.baseColorUrl = new URL(s.baseColor, base).href; if (!(await exists(s.baseColorUrl, memo))) delete s.baseColorUrl; }
          this.slots[k] = s;
        }
        if (man.animations) { const au = new URL(man.animations, base).href; if (await exists(au, memo)) this.animUrl = au; }
        this.manifest = man; if (man.name) this.name = man.name;
        this.available = Object.keys(this.slots).length > 0;
        if (this.available) this.preload();
        return this.available;
      } catch (e) { return false; }
      finally { this.settled = true; }
    })();
    return this._probe;
  },
  has(kind) { return this.available && !!this.slots[kind]; },
  ready(kind) { return !!this.cache[kind] && !!this._mods; },
  preload() { const ks = Object.keys(this.slots); ks.reduce((p, k) => p.then(() => this.load(k).catch((e) => { console.warn('monster model', k, e); delete this.slots[k]; })), Promise.resolve()); },

  async _mod() {
    if (!this._mods) {
      const [g, su] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
      this._mods = { GLTFLoader: g.GLTFLoader, SU: su };
    }
    return this._mods;
  },
  // one network fetch / parse per distinct file, shared by every slot that uses it
  _gltf(url) {
    if (!this._loading[url]) this._loading[url] = this._mod().then((m) => new m.GLTFLoader().loadAsync(url));
    return this._loading[url];
  },
  _texture(url) {
    if (!this.tex[url]) this.tex[url] = new THREE.TextureLoader().loadAsync(url).then((t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
    return this.tex[url];
  },

  async load(kind) {
    const slot = this.slots[kind]; if (!slot) throw new Error('no slot ' + kind);
    if (this.cache[kind]) return this.cache[kind];
    await this._mod();
    if (this.animUrl && !this.clipLib) { try { this.clipLib = (await this._gltf(this.animUrl)).animations || []; } catch (e) { console.warn('animation library failed', e); this.clipLib = []; } }
    const [gltf, map] = await Promise.all([this._gltf(slot.url), slot.baseColorUrl ? this._texture(slot.baseColorUrl).catch((e) => { console.warn('monster texture', e); return null; }) : null]);
    if (this.cache[kind]) return this.cache[kind];
    const entry = { gltf, map, clips: (gltf.animations || []).concat(this.clipLib || []), jersey: null };
    // the jersey is cut from the model's torso once per slot (it only needs the geometry and the skeleton's bone order)
    if (!slot.jersey || slot.jersey.mode !== 'none') {
      try {
        let sm = null; gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !sm && /body/i.test(o.name)) sm = o; });
        if (sm) {
          gltf.scene.updateMatrixWorld(true);
          const bone = (n) => sm.skeleton.bones.find((b) => b.name === n), y = (b) => (b ? _v.setFromMatrixPosition(b.matrixWorld).y : 0);
          const jc = Object.assign({ torso: ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'], weight: 0.7, offset: 0.01 }, slot.jersey || {});
          const pel = y(bone('pelvis')), s3 = y(bone('spine_03')), nk = y(bone('neck_01')), hs = nk - pel;
          if (jc.yMin === undefined) jc.yMin = pel + hs * (jc.hem !== undefined ? jc.hem : 0.0);
          if (jc.yMax === undefined) jc.yMax = s3 + (nk - s3) * (jc.neckline !== undefined ? jc.neckline : 0.6);
          entry.jersey = buildJerseyData(sm, jc);
        }
      } catch (e) { console.warn('jersey', e); }
    }
    return (this.cache[kind] = entry);
  },

  build(kind) {
    const slot = this.slots[kind], entry = this.cache[kind]; if (!slot || !entry || !this._mods) throw new Error('model not ready');
    const team = Object.assign({}, TEAM[kind] || TEAM.pip, NUM_BIG, slot.team || {});
    const H = slot.height || 6.2;
    const root = new THREE.Group(), body = new THREE.Group(), breathG = new THREE.Group(); root.add(body); body.add(breathG);
    const model = this._mods.SU.clone(entry.gltf.scene); breathG.add(model);

    // materials: a private copy per creature so the colour variant / tint of this slot does not leak into the others
    const hide = slot.hide || [], bones = [];
    model.traverse((o) => {
      if (o.isBone) bones.push(o);
      if (matchAny(o.name || '', hide)) o.visible = false;
      if (o.isMesh) {
        o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
        if (o.material) {
          o.material = o.material.clone();
          if (entry.map) o.material.map = entry.map;
          if (slot.tint) o.material.color.set(slot.tint);
          if (slot.emissive !== undefined) o.material.emissiveIntensity = slot.emissive;
          if (slot.metalness !== undefined) o.material.metalness = slot.metalness;
          if (slot.roughness !== undefined) o.material.roughness = slot.roughness;
          if (slot.noFog) o.material.fog = false;
        }
      }
    });

    // bones
    const bn = Object.assign({}, slot.bones || {}), find = (pat) => bones.find((b) => matchName(b.name, pat));
    const exact = (n) => bones.find((b) => b.name === n);
    const side = (stem, s) => (bn[stem + s] ? find(bn[stem + s]) : exact(BONE_NAMES[stem] + s));
    const B = {
      pelvis: bn.pelvis ? find(bn.pelvis) : exact(BONE_NAMES.pelvis),
      spine: BONE_NAMES.spine.map((n, i) => (bn['spine' + (i + 1)] ? find(bn['spine' + (i + 1)]) : exact(n))),
      neck: bn.neck ? find(bn.neck) : exact(BONE_NAMES.neck), head: bn.head ? find(bn.head) : exact(BONE_NAMES.head),
      clav: ['l', 'r'].map((s) => side('clav', s)), up: ['l', 'r'].map((s) => side('up', s)), lo: ['l', 'r'].map((s) => side('lo', s)), hand: ['l', 'r'].map((s) => side('hand', s)), fingers: [[], []]
    };
    const need = [B.pelvis, B.neck, B.head].concat(B.spine, B.clav, B.up, B.lo, B.hand);
    if (need.some((b) => !b)) throw new Error('monster rig: bones not found (' + kind + ')');
    B.hand.forEach((h, i) => h.traverse((n) => { if (n !== h && n.isBone && /_0[123]_/.test(n.name)) B.fingers[i].push(n); }));

    // fit: scale so the model is H tall (its box, T-pose arms do not matter), hips on the origin, centred on the pelvis
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), pel = B.pelvis.getWorldPosition(new THREE.Vector3());
    const sc = H / (size.y || 1), hipsAt = typeof slot.hipsAt === 'number' ? slot.hipsAt : (pel.y - box.min.y) / (size.y || 1);
    model.scale.multiplyScalar(sc);
    model.position.set(-pel.x * sc, -hipsAt * H - box.min.y * sc, -pel.z * sc);
    if (slot.offset) model.position.add(_v.fromArray(slot.offset));
    model.rotation.y = (slot.yawDeg || 0) * Math.PI / 180;
    root.updateMatrixWorld(true);

    // soccer kit: jersey skinned to the spine + scarf on the chest
    const sm = (() => { let r = null; model.traverse((o) => { if (o.isSkinnedMesh && !r && /body/i.test(o.name)) r = o; }); return r; })();
    if (entry.jersey && sm) { const j = makeJerseyMesh(entry.jersey, team, sm); sm.parent.add(j); }
    if (slot.scarf !== false && sm) {
      try {
        const nk = _v.setFromMatrixPosition(B.neck.matrixWorld), s3 = _v2.setFromMatrixPosition(B.spine[2].matrixWorld);
        // work in model space (unscaled): convert the neck / chest positions back
        const inv = new THREE.Matrix4().copy(model.matrixWorld).invert(); const nkm = nk.clone().applyMatrix4(inv), s3m = s3.clone().applyMatrix4(inv);
        const sk = Object.assign({ R: 0.11, r: 0.032, tail: 0.2, tailW: 0.065, dy: 0.0, dz: 0.0 }, slot.scarf || {});
        const c = new THREE.Vector3(nkm.x, (nkm.y + s3m.y) / 2 + (nkm.y - s3m.y) * 0.1 + sk.dy, nkm.z + sk.dz);
        if (sk.front === undefined) {                                             // chest surface under the tails, from the body geometry (bind pose)
          sk.front = c.z + sk.R; const P = sm.geometry.attributes.position, kx = c.x + sk.R * 0.78;
          for (let i = 0; i < P.count; i++) { if (Math.abs(P.getX(i) - kx) < 0.05 && P.getY(i) < c.y && P.getY(i) > c.y - sk.tail && P.getZ(i) > c.z - 0.05) sk.front = Math.max(sk.front === c.z + sk.R ? -9 : sk.front, P.getZ(i)); }
          sk.front += 0.004;
        }
        const sg = makeScarf(team, c, sk); model.add(sg); model.updateMatrixWorld(true); B.spine[2].attach(sg);
      } catch (e) { console.warn('scarf', e); }
    }

    // captain's armband on the character's left upper arm (sized from the arm's own geometry)
    if (slot.armband !== false && sm) {
      try {
        const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
        const pa = B.up[0].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), pb = B.lo[0].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        const ab = makeArmband(sm, pa, pb, team, slot.armband || {});
        if (ab) { model.add(ab); model.updateMatrixWorld(true); B.up[0].attach(ab); }
      } catch (e) { console.warn('armband', e); }
    }

    // rig
    const cfg = Object.assign({}, slot.rig || {});
    if (cfg.curlAxis) cfg.curlAxis = new THREE.Vector3().fromArray(cfg.curlAxis);
    if (cfg.thumbAxis) cfg.thumbAxis = new THREE.Vector3().fromArray(cfg.thumbAxis);
    if (slot.pose) cfg.pose = slot.pose; if (slot.handScale !== undefined) cfg.handScale = slot.handScale; if (slot.armLen !== undefined) cfg.armLen = slot.armLen; if (slot.rest) cfg.rest = slot.rest;
    const rig = new MonsterRig({ model, body, bones: B, sc, cfg });
    const arms = rig.arms;

    // animation clips (optional: only when a clip library / the model itself provides them)
    let mixer = null, idle = null, moodAct = null;
    const findClip = (key) => { const cands = (slot.clips && slot.clips[key]) ? [].concat(slot.clips[key]) : (DEFAULT_CLIPS[key] || []); for (const n of cands) { const c = entry.clips.find((cl) => cl.name === n) || entry.clips.find((cl) => cl.name.toLowerCase().indexOf(String(n).toLowerCase()) >= 0); if (c) return c; } return null; };
    if (entry.clips.length) {
      mixer = new THREE.AnimationMixer(model);
      const ic = findClip('idle'); if (ic) { idle = mixer.clipAction(ic); idle.play(); rig.clipMode = true; }
      mixer.addEventListener('finished', (ev) => { if (ev.action === moodAct && idle) { idle.reset().play(); moodAct.crossFadeTo(idle, 0.35, false); moodAct = null; } });
    }

    // framing, gaze origin
    const hp = B.head.getWorldPosition(new THREE.Vector3()), top = box.max.y * 0 + (size.y - hipsAt * size.y) * sc;
    const headC = new THREE.Vector3(hp.x, hp.y + (box.max.y - hp.y) * 0.5, hp.z + (slot.gazeFwd !== undefined ? slot.gazeFwd : 0.04 * H));
    if (slot.gazeAt) headC.add(_v.fromArray(slot.gazeAt));
    const invBody = new THREE.Matrix4();
    const styleName = slot.style || kind, style = STYLE[styleName] || STYLE.fox;
    const bodyShare = rig.pose.bodyShare;
    const actor = {
      kind, root, body, arms, style, top: slot.top || (top + 0.35), headC, invBody,
      fit: slot.fit || 1, fitY: slot.fitY || 0, lean: slot.lean || 0, portrait: slot.portrait || null,   // framing: size tweak, hip height offset (actor units), resting lean (rad, <0 = back)
      styleKey: slot.entrance || styleName,       // which entrance / exit / idle-flair set the gestures use
      playMood(name) {
        if (!mixer) return; const cl = findClip(name); if (!cl) return;
        const a = mixer.clipAction(cl); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false;
        if (idle) idle.crossFadeTo(a, 0.25, false); a.play(); moodAct = a;
      },
      apply(P, now) {
        body.position.set(0, P.hop, P.slide); body.rotation.set(P.lean * bodyShare, P.turn, P.sway); body.updateMatrix(); invBody.copy(body.matrix).invert();
        if (mixer) mixer.update(P.dt);
        rig.update(P);
      },
      dispose() { if (mixer) mixer.stopAllAction(); }
    };
    return actor;
  }
};
