// Builds the game-ready Monsters pack files from the Quaternius "Bestiary - Dungeon Monsters Kit [Standard]" GLBs.
// The kit itself is NOT in this repo (its licence forbids redistributing it as an asset pack): download it, then run
//
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp     (in any scratch folder, NOT in the repo)
//   cp assets/creatures/tools/optimize-monsters.mjs <scratch folder>/        (ES modules resolve packages next to the script)
//   node optimize-monsters.mjs "<kit>/Exports/GLB (Godot-Unreal)" "<kit>/Textures" <repo>/assets/creatures/monsters
//
// What it does, per model (Imp, Puglin):
//   * removes the weapon / chain meshes, and every vertex attribute the game does not use (UV1-4, vertex colours)
//   * resizes textures: base colour 1024, normal / ORM 512, emissive 256, re-encoded as WebP (EXT_texture_webp)
//   * embeds colour variant 1 in the .glb; variants 2 and 3 are written next to it as small WebP files that the
//     manifest swaps in per slot ("baseColor": "textures/imp_2.webp"), so one geometry serves several opponents.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [glbDir, texDir, outDir] = process.argv.slice(2);
if (!glbDir || !texDir || !outDir) { console.error('usage: node optimize-monsters.mjs <glb dir> <texture dir> <out dir>'); process.exit(1); }
fs.mkdirSync(path.join(outDir, 'textures'), { recursive: true });

const MODELS = {
  Imp: { drop: ['Imp_Mace', 'Imp_Chains'], variants: 3 },
  Puglin: { drop: ['Puglin_Stick'], variants: 3 }
};
const KEEP = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']);
const SIZE = { base: 1024, normal: 512, orm: 512, emissive: 256 };
const webp = (buf, size, q) => sharp(buf).resize(size, size, { fit: 'fill' }).webp({ quality: q, effort: 6 }).toBuffer();

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [name, cfg] of Object.entries(MODELS)) {
  const doc = await io.read(path.join(glbDir, name + '.glb'));
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (cfg.drop.includes(n.getName())) { n.setMesh(null); n.dispose(); }
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) for (const sem of p.listSemantics()) if (!KEEP.has(sem)) p.setAttribute(sem, null);
  await doc.transform(prune(), dedup());
  const mat = root.listMaterials()[0];
  mat.setDoubleSided(false);
  const slots = { base: mat.getBaseColorTexture(), normal: mat.getNormalTexture(), orm: mat.getMetallicRoughnessTexture(), emissive: mat.getEmissiveTexture() };
  const files = { base: `T_${name}_BaseColor_1.png`, normal: `T_${name}_Normal.png`, orm: `T_${name}_ORM.png`, emissive: `T_${name}_Emissive.png` };
  for (const [slot, tex] of Object.entries(slots)) {
    if (!tex) continue;
    const src = fs.readFileSync(path.join(texDir, files[slot]));        // the kit's PNG, so every slot is re-encoded from the original
    tex.setImage(new Uint8Array(await webp(src, SIZE[slot], slot === 'base' ? 82 : 78))).setMimeType('image/webp');
  }
  const out = path.join(outDir, name.toLowerCase() + '.glb');
  await io.write(out, doc);
  console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
  for (let v = 2; v <= cfg.variants; v++) {
    const f = path.join(outDir, 'textures', `${name.toLowerCase()}_${v}.webp`);
    fs.writeFileSync(f, await webp(fs.readFileSync(path.join(texDir, `T_${name}_BaseColor_${v}.png`)), SIZE.base, 82));
    console.log(f, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
  }
}
