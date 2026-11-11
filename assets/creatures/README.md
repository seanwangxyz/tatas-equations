# Creature packs

`js/three/creatures.js` builds the opponent across the table from a **pack**. `T3.creaturePacks()` lists them;
`T3.setCreature(kind, packId)` picks one (default `S.cos.pack`, else `classic`). `kind` is the opponent slot:
`sloth penguin fox owl wizard pip`. If a pack or one of its models is missing or fails to load, the game silently uses
`classic` for that slot. Pip (the tutorial helper) always stays classic.

| Pack | Source | Needs files? |
|---|---|---|
| `classic` | code-built animals in `js/three/creatures/classic.js` | no |
| `monsters` | glTF models listed in `assets/creatures/monsters/manifest.json` (Quaternius Imp and Puglin) | yes, included; see `monsters/CREDITS.md` |

## Monsters pack

Two models, five opponents: each slot names a `.glb` and, optionally, a different base-colour texture, so one geometry
serves several opponents.

| Slot | Model | Colour | Entrance style |
|---|---|---|---|
| `sloth` | Puglin | rose (`puglin_2.webp`) | ambles in, yawns, waves |
| `penguin` | Puglin | blue (`puglin_3.webp`) | waddles in, slides the last bit |
| `fox` | Imp | red (embedded variant 1) | darts in |
| `owl` | Imp | green (`imp_2.webp`) | pops up from behind the table edge |
| `wizard` | Imp | violet (`imp_3.webp`) | appears in a puff of stars |

The kit has **no animation clips**, so the skeleton is driven in code (`js/three/creatures/monsterrig.js`):

* rest pose: arms down and a little bent, relaxed fingers, a personal slouch/head angle (`pose`), slow breathing through the spine;
* gaze: neck and head turn toward the moving cube / the player (the same gaze the classic creatures use);
* moods, dances, entrances, talking: the shared gesture table (`creatures/gestures.js`) asks for a body pose (lean, hop,
  sway, turn, shrug, head angles) and hand targets; the rig turns those into spine / clavicle / head rotations and
  two-bone IK on the real arm bones, with the fingers curling to the requested open/closed amount;
* reaching: the real arm reaches for the die with IK. If the die is farther than the arm, the arm **stretches like rubber**
  (upper arm and forearm bones are scaled along their length, a little thinner; the hand keeps its size), so the real mesh
  and textures are always used and the colours always match. Only the arm carrying a die may stretch a long way;
* soccer kit, built in code from the model's own geometry (`creatures/monsterwear.js`): a **jersey** cut from the torso
  triangles and skinned to the spine bones (it bends and breathes with the body) with a number, a striped **scarf**, and a
  **captain's armband** on the left upper arm. Colours come from the opponent's team colours (`TEAM` in `creatures/common.js`,
  overridable per slot with `team`).

If a clip library ever becomes available, set `"animations": "UniversalAnimationLibrary.glb"` in the manifest (the file
must exist, it is checked with a HEAD request first) and map moods to clips with `clips`; clips then drive the skeleton and the
rig only adds the gaze and the reaches on top. (Not exercised yet: no clips were available.)

### Manifest format

Paths are relative to `manifest.json`. The pack is `available` when the manifest loads and at least one slot's file exists;
slots whose file is missing fall back to classic individually. Models are preloaded in the background one after another
(each distinct file is fetched once); if one is not ready when a game starts, the classic stand-in is shown and the model is
swapped in once it has loaded and the creature is idle. Loading never blocks the game.

```jsonc
{
  "version": 1,
  "name": "Monsters",                       // shown by T3.creaturePacks()
  "animations": "UniversalAnimationLibrary.glb",   // optional (see above); leave it out when the file is not there
  "defaults": { ... },                      // any slot option below, applied to every slot
  "slots": {
    "sloth": {                              // sloth|penguin|fox|owl|wizard
      "name": "Puglin (rose)",              // display name (informational)
      "file": "puglin.glb",                 // required
      "baseColor": "textures/puglin_2.webp",// optional: replaces the model's base-colour texture for this slot
      "tint": "#ffd0d0",                    // optional: multiplied with the base colour
      "style": "sloth",                     // personality preset (speed, gaze rate, breathing, mood length): a classic kind name
      "entrance": "pip",                    // optional: entrance / exit / idle-flair set to use (a classic kind name or "pip"); default = style
      "height": 4.4,                        // model is scaled to this height (creature units; a die is 0.59 wide)
      "hipsAt": 0.4275,                     // fraction of height where the pelvis is; the pelvis sits on the creature's origin
      "yawDeg": 0,                          // rotate the model if it does not face +z
      "offset": [0, 0, 0],                  // nudge after fitting
      "top": 3.0,                           // height above the hips the camera must keep in view (default derived)
      "hide": ["Mace", "/axe/i"],           // node names to hide: substring, or "/regex/flags"
      "pose": { "slouch": 0.16, "headDown": 0.05, "headTilt": 0, "shoulderDrop": 0.06, "bodyShare": 0.55 },  // radians; resting posture
      "armLen": 1.3,                        // arms are this much longer than the rig's (default derived so arms reach about as far as the classic ones)
      "handScale": 0.85,                    // size of the hands relative to the model
      "rest": [0.17, 0.72, 0.3],            // where the hands hang at rest, as fractions of arm length from the shoulder (side, down, forward)
      "rig": { "handRoll": 0, "curl": 1.15, "curlAxis": [1, 0, 0], "curlSign": [1, 1] },   // palm roll (deg) and finger curl
      "scarf": { "R": 0.14, "r": 0.04, "tail": 0.2, "tailW": 0.07, "tails": true, "dy": 0 }, // model units; false = no scarf
      "armband": { "at": 0.5, "width": 0.2 },   // or false
      "jersey": { "mode": "fit", "weight": 0.7, "offset": 0.01 },  // "mode": "none" to skip the jersey
      "team": { "jersey": "#2f9e44", "dark": "#237a35", "trim": "#d8f5a2", "num": "1", "pattern": "sash" },  // overrides TEAM[kind]
      "clips": { "idle": ["Idle_Loop"], "think": ["Idle_Talking"], "happy": ["Victory"] },   // only with a clip library
      "bones": { "head": "Head" }           // optional bone-name overrides (default: the Unreal-style names)
    }
  }
}
```

Not supported for glTF: facial expressions, tears/steam, blinking, eye tracking (the models have no face rig).
The monsters' faces never change; the body language does the acting. Rebuilding the optimised files from the original kit is
described in `monsters/CREDITS.md` (`assets/creatures/tools/optimize-monsters.mjs`).
