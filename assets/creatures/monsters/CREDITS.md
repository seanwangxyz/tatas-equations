# Monsters pack: credits and licence

The 3D models in this folder (`imp.glb`, `puglin.glb`, `textures/*.webp`) are based on **Bestiary - Dungeon Monsters Kit
[Standard]** by **Quaternius** (https://quaternius.com), models "Imp" and "Puglin".

Licence (Quaternius "Standard" licence, `License_Standard.txt` in the kit): the assets may be used inside a published
game or project, commercial or not, and no credit is required (credit is appreciated). They may **not** be redistributed
or resold as a standalone asset pack.

These files are therefore **part of this game and not for reuse as assets**. They are optimised, trimmed derivatives
(weapon and chain meshes removed, textures resized and re-encoded), shipped only because the game loads them. Do not
publish this folder as a model pack. The original kit zip and the unpacked source folder are deliberately **not** in this
repository (`assets-src/` is untracked); download the kit from Quaternius if you need to rebuild.

## What was changed from the original kit

| File | From | Changes |
|---|---|---|
| `imp.glb` | `Exports/GLB (Godot-Unreal)/Imp.glb` | removed `Imp_Mace`, `Imp_Chains`; dropped UV1-4 and vertex colours; textures 1024 (base colour) / 512 (normal, ORM) / 256 (emissive) as WebP; single-sided |
| `puglin.glb` | `Exports/GLB (Godot-Unreal)/Puglin.glb` | removed `Puglin_Stick`; same attribute and texture changes |
| `textures/imp_2.webp`, `imp_3.webp` | `Textures/T_Imp_BaseColor_2/3.png` | 1024 px WebP; the manifest swaps them in per opponent (`baseColor`) so one `.glb` serves three opponents |
| `textures/puglin_2.webp`, `puglin_3.webp` | `Textures/T_Puglin_BaseColor_2/3.png` | same |

The skeleton (55 bones, Unreal-style humanoid) is untouched. The kit has no animation clips: the game drives the bones
procedurally (see `js/three/creatures/monsterrig.js`). The soccer jersey, scarf and captain's armband are generated in code
at load time from the model's own torso and arm geometry (`js/three/creatures/monsterwear.js`); they are not in the files.

## Rebuilding the files

Needs Node 18+. Download and unzip the kit somewhere outside the repo, then (from any scratch folder):

```
npm init -y
npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
cp <repo>/assets/creatures/tools/optimize-monsters.mjs .
node optimize-monsters.mjs "<kit>/Exports/GLB (Godot-Unreal)" "<kit>/Textures" <repo>/assets/creatures/monsters
```

(The script has to sit next to the `node_modules` it imports, hence the copy.) It prints the size of every file it writes;
the two `.glb` files come out at roughly 550 KB (Imp) and 320 KB (Puglin), the colour variants at 20-40 KB each.
