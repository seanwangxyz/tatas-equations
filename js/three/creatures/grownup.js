// "Tata": a grown-up on the same rig as the kid (kid.js buildHuman), in cartoon proportions: longer legs and body,
// a smaller head for his height, a slim face with a longer chin, black hair longer on top and tousled, falling to both
// sides with a few lighter brown strands, a hint of stubble and a warm smile. Default shirt: yellow, number 17.
import { buildHuman, KID, KITS, TATA_KIT, kitFromSave } from './kid.js';

export const TATA = Object.assign({}, KID, {
  SH_Y: 1.9, SH_X: 0.9,
  NECK_Y: 2.4, HEAD_UP: 0.6, HEAD_R: 0.6,
  torsoX: 1.1, torsoY: 1.24, neckLen: 0.62, neckR: 0.95,
  hipY: -0.72, thigh: 0.95, shin: 1.4, legR: 1.15, shortsY: -0.36, shortsH: 0.86, shortsR: 0.92,
  L1: 1.18, L2: 1.24, armR: 1.12, handS: 0.68,
  head: { sx: 0.86, sy: 1.1, sz: 0.97, jaw: 0.16, chin: 0.5 },
  face: { eyeX: 0.32, eyeY: 0.03, eyeR: 0.15, browY: 0.27, browLen: 0.26, browTh: 0.055, mouthY: -0.44, mouthW: 0.95, noseY: -0.12, cheekX: 0.48, cheekY: -0.24, cheekR: 0.1 }
});
// heights derived from the build: top of the hair and the soles of the boots (local units)
TATA.TOP = TATA.NECK_Y + TATA.HEAD_UP + TATA.HEAD_R * TATA.head.sy * 1.27;
TATA.FOOT = TATA.hipY - TATA.thigh - TATA.shin - 0.14;
TATA.HIP_LOW = TATA.shortsY - TATA.shortsH / 2;

export const TATA_LOOK = { skin: '#e2ae86', hair: '#17130f', streaks: '#6a4a33', hairStyle: 'tousled', eyes: '#3d2614', brows: '#1b1511', cheeks: '#e59a8a', stubble: true, adult: true };
export const TATA_DEFAULT = { kit: TATA_KIT, name: 'Tata', number: '17' };

export function buildTata(kit, num, name, front, look) {
  return buildHuman({ dims: TATA, kit: kit || KITS.yellow, num: num || '17', name: name == null ? 'TATA' : name, front: front, look: Object.assign({}, TATA_LOOK, look || {}) });
}
export { kitFromSave };
