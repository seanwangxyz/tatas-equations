// PEOPLE IN 3D: one human figure from an avatar (the shape described in js/people-data.js, global People).
//
// THE CONTRACT (js/three/player.js and the portraits rely on exactly this; keep the names and meanings):
//   buildPerson({ avatar, kit, num, name, front })  -> a model with the same interface as buildHuman() in kid.js
//                                    (root, setKit, setHair, setFace, the arm rigs ...). avatar: any object, cleaned
//                                    with People.clean(). kit: a full kit object (kitFromSave) or nothing.
//   personDims(avatar)               -> the body measurements used for that avatar (the same shape as KID / TATA in
//                                    kid.js / grownup.js: SH_Y, TOP, FOOT, L1, L2, handS ...), for seats and reach
//   personLook(avatar)               -> the look object handed to buildHuman (skin, hair, hairStyle, eyes, ...)
//   personKey(avatar)                -> a short string that changes whenever the figure must be rebuilt
//   personAdult(avatar)              -> true for the grown-up bodies (they use the grown-up reactions)
//
// THIS FIRST VERSION is a placeholder so everything can be wired: two bodies only (the kid and the grown-up), with the
// avatar's skin, hair, hair style (the six old styles) and eye colour. The full version adds the other bodies, heights,
// hair styles, glasses, beards, freckles, lashes and hair accessories.
import { buildHuman, KID, KID_LOOK, KITS } from './kid.js';
import { TATA, TATA_LOOK } from './grownup.js';

const OLD_STYLES = ['swept', 'short', 'spiky', 'curly', 'long', 'tousled'];
function P() { return (typeof window !== 'undefined' && window.People) || null; }
function cleanAv(avatar) { const p = P(); return p ? p.clean(avatar) : Object.assign({ body: 'kid' }, avatar || {}); }
export function personAdult(avatar) { const a = cleanAv(avatar); return a.body === 'adult-a' || a.body === 'adult-b'; }
export function personDims(avatar) { return personAdult(avatar) ? TATA : KID; }
export function personLook(avatar) {
  const a = cleanAv(avatar), adult = personAdult(a), base = adult ? TATA_LOOK : KID_LOOK;
  return Object.assign({}, base, { skin: a.skin || base.skin, hair: a.hair || base.hair, hairStyle: OLD_STYLES.indexOf(a.hairStyle) >= 0 ? a.hairStyle : base.hairStyle,
    eyes: a.eyes || base.eyes, stubble: adult && a.beard && a.beard !== 'none', streaks: null, brows: null });
}
export function personKey(avatar) { const p = P(), a = cleanAv(avatar); return p ? p.pack(a) : JSON.stringify(a); }
export function buildPerson(spec) {
  spec = spec || {};
  return buildHuman({ dims: personDims(spec.avatar), kit: spec.kit || KITS.red, num: spec.num, name: spec.name, front: spec.front, look: personLook(spec.avatar) });
}
