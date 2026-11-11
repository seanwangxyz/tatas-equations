// The "monsters" pack: glTF characters (Quaternius "Bestiary - Dungeon Monsters Kit", humanoid rig) described by
// assets/creatures/monsters/manifest.json. Format documented in assets/creatures/README.md.
//
// If the manifest (or every file in it) is missing the pack simply reports available:false and the game uses classic.
// GLTFLoader / SkeletonUtils are imported lazily so a failed CDN fetch can never break the classic creatures.
//
// Arms: the rig's own arms are collapsed (upper-arm bones scaled to ~0) and replaced by the same procedural
// two-bone stretchy arms and gripping hands the classic pack uses, anchored at the model's shoulder bones. The
// head bone gets the gaze (world-space rotation on top of whatever clip is playing). Clips map to idle/moods.
import * as THREE from 'three';
import { std, jerseyTorso, TEAM, ArmRig, clamp } from './common.js';
import { STYLE, restPos } from './classic.js';

const MANIFEST = 'assets/creatures/monsters/manifest.json';
const DEFAULT_CLIPS = {
  idle: ['Idle_Loop', 'Idle', 'idle'],
  think: ['Idle_Talking', 'Talking', 'think', 'Thinking'],
  happy: ['Victory', 'Cheer', 'Celebrate', 'Happy', 'Dance', 'Wave', 'Jump'],
  sad: ['Defeat', 'Sad', 'Hit', 'Death', 'Hurt', 'Sit'],
  challenge: ['Taunt', 'Point', 'Roar', 'Attack', 'Punch', 'Yell']
};
const hexv = (v) => (typeof v === 'string' ? parseInt(v.replace(/^#|^0x/i, ''), 16) : v);
const _pq = new THREE.Quaternion(), _hq = new THREE.Quaternion(), _R = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3();

function matchName(name, pat) {
  if (!pat) return false;
  if (typeof pat === 'string' && pat[0] === '/') { const i = pat.lastIndexOf('/'); try { return new RegExp(pat.slice(1, i), pat.slice(i + 1) || 'i').test(name); } catch (e) { return false; } }
  return name.toLowerCase().indexOf(String(pat).toLowerCase()) >= 0;
}
function matchAny(name, pats) { return (pats || []).some((p) => matchName(name, p)); }

export const MonstersPack = {
  id: 'monsters', name: 'Monsters', available: false, manifest: null, slots: {}, cache: {}, clipLib: null, _mods: null,

  // Fetch the manifest and check which model files exist. Resolves true if the pack is usable.
  probe() {
    if (this._probe) return this._probe;
    this._probe = (async () => {
      try {
        const url = new URL(MANIFEST, document.baseURI), r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) return false;
        const man = await r.json();
        if (!man || !man.slots || typeof man.slots !== 'object') return false;
        const base = new URL('.', url).href, def = man.defaults || {};
        for (const k of Object.keys(man.slots)) {
          const s = Object.assign({}, def, man.slots[k]); if (!s.file) continue;
          s.url = new URL(s.file, base).href;
          try { const h = await fetch(s.url, { method: 'HEAD' }); if (!h.ok && h.status !== 405 && h.status !== 501) continue; } catch (e) { continue; }
          this.slots[k] = s;
        }
        if (man.animations) this.animUrl = new URL(man.animations, base).href;
        this.manifest = man; if (man.name) this.name = man.name;
        this.available = Object.keys(this.slots).length > 0;
        if (this.available) this.preload();
        return this.available;
      } catch (e) { return false; }
    })();
    return this._probe;
  },
  has(kind) { return this.available && !!this.slots[kind]; },
  ready(kind) { return !!this.cache[kind] && !!this._mods; },
  preload() { const ks = Object.keys(this.slots); ks.reduce((p, k) => p.then(() => this.load(k).catch((e) => { console.warn('monster model', k, e); delete this.slots[k]; })), Promise.resolve()); },

  async load(kind) {
    const slot = this.slots[kind]; if (!slot) throw new Error('no slot ' + kind);
    if (this.cache[kind]) return this.cache[kind];
    if (!this._mods) {
      const [g, su] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
      this._mods = { GLTFLoader: g.GLTFLoader, SU: su };
    }
    const loader = new this._mods.GLTFLoader();
    if (this.animUrl && !this.clipLib) { try { this.clipLib = (await loader.loadAsync(this.animUrl)).animations || []; } catch (e) { console.warn('animation library failed', e); this.clipLib = []; } }
    if (this.cache[kind]) return this.cache[kind];
    const gltf = await loader.loadAsync(slot.url);
    return (this.cache[kind] = { gltf, clips: (gltf.animations || []).concat(this.clipLib || []) });
  },

  build(kind) {
    const slot = this.slots[kind], entry = this.cache[kind]; if (!slot || !entry || !this._mods) throw new Error('model not ready');
    const team = Object.assign({}, TEAM[kind] || TEAM.pip, slot.team || {});
    const H = slot.height || 6.2, hipsAt = slot.hipsAt === undefined ? 0.5 : slot.hipsAt, k = H / 6.2;
    const root = new THREE.Group(), body = new THREE.Group(), breathG = new THREE.Group(); root.add(body); body.add(breathG);
    const model = this._mods.SU.clone(entry.gltf.scene); breathG.add(model);

    // fit: scale to height, feet at -hipsAt*H, centered
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const sc = H / (size.y || 1); model.scale.multiplyScalar(sc);
    model.position.set(-c.x * sc, -hipsAt * H - box.min.y * sc, -c.z * sc);
    if (slot.offset) model.position.add(_v.fromArray(slot.offset));
    model.rotation.y = (slot.yawDeg || 0) * Math.PI / 180;
    const hide = slot.hide || [], bones = [];
    model.traverse((o) => {
      if (o.isBone) bones.push(o);
      if (matchAny(o.name || '', hide)) o.visible = false;
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; if (o.material && slot.noFog) o.material.fog = false; }
    });
    model.updateMatrixWorld(true);

    // bones
    const bn = slot.bones || {};
    const byPat = (pat) => bones.find((b) => matchName(b.name, pat));
    let head = bn.head ? byPat(bn.head) : (bones.find((b) => /(^|[^a-z])head($|[^a-z])/i.test(b.name) && !/top|end|tip/i.test(b.name)) || bones.find((b) => /head/i.test(b.name) && !/top|end|tip/i.test(b.name)));
    let ups = [];
    if (bn.upperArmL || bn.upperArmR) { ups = [byPat(bn.upperArmL), byPat(bn.upperArmR)].filter(Boolean); }
    if (ups.length < 2) { ups = bones.filter((b) => /upper.?arm/i.test(b.name) && !/twist|fore|lower/i.test(b.name)); if (ups.length < 2) ups = bones.filter((b) => /(^|[^a-z])arm($|[^a-z])|arm[._\- ]?(l|r|left|right)$/i.test(b.name) && !/fore|lower|hand|twist/i.test(b.name)); }
    const shoulders = [[-1.0 * k, 1.42 * k, 0], [1.0 * k, 1.42 * k, 0]];
    let hideBones = [];
    if (slot.shoulders) { shoulders[0] = slot.shoulders[0]; shoulders[1] = slot.shoulders[1]; }
    else if (ups.length >= 2) {
      const ps = ups.map((b) => b.getWorldPosition(new THREE.Vector3())).sort((a, b) => a.x - b.x);
      shoulders[0] = [ps[0].x, ps[0].y, ps[0].z]; shoulders[1] = [ps[ps.length - 1].x, ps[ps.length - 1].y, ps[ps.length - 1].z];
    }
    if (slot.hideArms !== false) hideBones = ups.slice(0, 2);

    // jersey shell (fractions are in actor units relative to the hips; see README)
    const jc = Object.assign({ mode: 'shell', y: -0.2, h: 2.2, r: 1.1 * k, z: 1 }, slot.jersey || {});
    if (jc.mode !== 'none') {
      const j = jerseyTorso(team, 1); j.scale.set(jc.r / 1.1, jc.h / 1.92, jc.r / 1.1 * jc.z); j.position.set(jc.x || 0, jc.y, jc.zOff || 0); body.add(j);
    }

    // procedural arms
    const ac = Object.assign({ color: 0x8a7a6a, hand: 0x8a7a6a, sleeve: true, L1: 1.3 * k, L2: 1.4 * k, handScale: 1.1 * k }, slot.arm || {});
    const jerseyM = std(new THREE.Color(team.jersey).getHex()), trimM = std(new THREE.Color(team.trim).getHex());
    const arms = [-1, 1].map((s, i) => {
      const a = new ArmRig(body, s, {
        L1: ac.L1, L2: ac.L2, shoulder: shoulders[i], maxStretch: 3.8, rUp: 0.24 * k, rFore: 0.22 * k, sleeveR: 0.32 * k,
        furMat: std(hexv(ac.color)), foreMat: std(hexv(ac.fore !== undefined ? ac.fore : ac.color)), sleeveMat: ac.sleeve ? jerseyM : null, trimMat: trimM,
        hand: { mat: std(hexv(ac.hand)), scale: ac.handScale }
      });
      a.rest = restPos(s); return a;
    });

    // animation
    let mixer = null, idle = null, moodAct = null;
    const find = (key) => { const cands = (slot.clips && slot.clips[key]) ? [].concat(slot.clips[key]) : DEFAULT_CLIPS[key]; for (const n of cands) { const c = entry.clips.find((cl) => cl.name === n) || entry.clips.find((cl) => cl.name.toLowerCase().indexOf(String(n).toLowerCase()) >= 0); if (c) return c; } return null; };
    if (entry.clips.length) {
      mixer = new THREE.AnimationMixer(model);
      const ic = find('idle'); if (ic) { idle = mixer.clipAction(ic); idle.play(); }
      mixer.addEventListener('finished', (ev) => { if (ev.action === moodAct && idle) { idle.reset().play(); moodAct.crossFadeTo(idle, 0.35, false); moodAct = null; } });
    }
    const headPos = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, (1 - hipsAt) * H * 0.9, 0.1);
    const invBody = new THREE.Matrix4();
    const styleName = slot.style || kind, style = STYLE[styleName] || STYLE.fox;
    const actor = {
      kind, root, body, arms, style, top: slot.top || ((1 - hipsAt) * H + 0.3), headC: headPos, invBody,
      playMood(name) {
        if (!mixer) return; const cl = find(name); if (!cl) return;
        const a = mixer.clipAction(cl); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false;
        if (idle) idle.crossFadeTo(a, 0.25, false); a.play(); moodAct = a;
      },
      apply(P, now) {
        body.position.set(0, P.hop, P.slide); body.rotation.set(P.lean, P.turn, P.sway); body.updateMatrix(); invBody.copy(body.matrix).invert();
        const br = P.breath; breathG.scale.set(1 + 0.008 * br, 1 + 0.014 * br, 1 + 0.008 * br);
        if (mixer) mixer.update(P.dt);
        for (let i = 0; i < hideBones.length; i++) hideBones[i].scale.setScalar(0.0001);
        if (head) {
          model.updateMatrixWorld(true);
          _e.set(P.headPitch * 0.8, P.headYaw, P.headRoll); _R.setFromEuler(_e);
          head.parent.getWorldQuaternion(_pq); head.getWorldQuaternion(_hq);
          _hq.premultiply(_R); head.quaternion.copy(_pq.invert().multiply(_hq));
        }
        for (let i = 0; i < 2; i++) arms[i].setShoulderLift(P.shrug * 0.12);
      },
      dispose() { if (mixer) mixer.stopAllAction(); }
    };
    return actor;
  }
};
