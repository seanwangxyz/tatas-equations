// "Tata": a grown-up on the same rig as the kid (kid.js buildHuman), in cartoon proportions: longer legs and body,
// a smaller head for his height, a slim face with a longer chin, black hair longer on top and tousled, falling to both
// sides with a few lighter brown strands, a hint of stubble and a warm smile. Default kit (TATA_KIT in kid.js): yellow
// with navy trim, a navy V-neck band with a yellow stripe, navy number 17 (tall & thin), his own crest (the star roundel)
// and maker's mark (the bolt). Every kit option (collar, sleeves, number style, boots, gloves, armband...) works on him too.
import { buildHuman, KID, KITS, TATA_KIT, kitFromSave } from './kid.js';

// His build: V-shaped, lean but muscular (a fit dad in a football kit, not a bodybuilder). Broad shoulders with round
// deltoids tapering to a narrow waist (torsoCtrl: the shirt's profile, r / torsoX against y / torsoY, the same heights as
// the kid's so the collar, badges and numbers land in the same places), a chest less deep than wide (zs), pecs and
// shoulder blades under the shirt (muscle: see torsoBump in kid.js), arms with biceps and forearms tapering to the wrist,
// legs with fuller quads and calves (thigh ~ shin, adult proportions).
export const TATA = Object.assign({}, KID, {
  SH_Y: 1.9, SH_X: 0.98,
  NECK_Y: 2.4, HEAD_UP: 0.6, HEAD_R: 0.6,
  torsoX: 1.1, torsoY: 1.24, neckLen: 0.62, neckR: 1.05, zs: 0.8, muscle: 1,
  torsoCtrl: [[0.001, 0], [0.58, 0.03], [0.62, 0.22], [0.63, 0.42], [0.715, 0.7], [0.835, 0.98], [0.905, 1.22], [0.9, 1.44], [0.8, 1.6], [0.6, 1.76], [0.4, 1.86], [0.001, 1.88]],
  hipY: -0.72, thigh: 1.15, shin: 1.2, legR: 1.15, hipX: 0.4, waistTop: 0.14, hemL: 0.62, shortsRb: 0.32,
  L1: 1.18, L2: 1.24, armR: 1.22, handS: 0.68, sleeveK: 0.86,
  head: { sx: 0.86, sy: 1.1, sz: 0.97, jaw: 0.16, chin: 0.5 },
  face: { eyeX: 0.32, eyeY: 0.03, eyeR: 0.15, browY: 0.27, browLen: 0.26, browTh: 0.055, mouthY: -0.44, mouthW: 0.95, noseY: -0.12, cheekX: 0.48, cheekY: -0.24, cheekR: 0.1 }
});
// heights derived from the build: top of the hair and the soles of the boots (local units)
TATA.TOP = TATA.NECK_Y + TATA.HEAD_UP + TATA.HEAD_R * TATA.head.sy * 1.27;
TATA.FOOT = TATA.hipY - TATA.thigh - TATA.shin - 0.14;
TATA.HIP_LOW = TATA.hipY - TATA.hemL;

// Tata: warm light skin, black hair with a few lighter brown strands, dark almond eyes that crinkle a little with his
// smile, light stubble and a faint moustache, a gentle closed-mouth smile (vneck: the collar used when a kit has none)
export const TATA_LOOK = { skin: '#e4b48e', hair: '#17130f', streaks: '#7a5536', hairStyle: 'tousled', eyes: '#2e1c10', brows: '#1b1511', cheeks: '#e59a8a', stubble: true, adult: true,
  eyeW: 1.12, eyeH: 0.92, tilt: 0.05, happy: 0.22, vneck: true };
export const TATA_DEFAULT = { kit: TATA_KIT, name: 'Tata', number: '17' };

export function buildTata(kit, num, name, front, look) {
  return buildHuman({ dims: TATA, kit: kit || KITS.yellow, num: num || '17', name: name == null ? 'TATA' : name, front: front, look: Object.assign({}, TATA_LOOK, look || {}) });
}
export { kitFromSave };
