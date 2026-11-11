# Creature packs

`js/three/creatures.js` builds the opponent across the table from a **pack**. `T3.creaturePacks()` lists them;
`T3.setCreature(kind, packId)` picks one (default `S.cos.pack`, else `classic`). `kind` is the opponent slot:
`sloth penguin fox owl wizard pip`. If a pack or one of its models is missing, the game silently uses `classic`.

| Pack | Source | Needs files? |
|---|---|---|
| `classic` | code-built animals in `js/three/creatures/classic.js` | no |
| `monsters` | glTF models listed in `assets/creatures/monsters/manifest.json` | yes (not in the repo yet) |

## Monsters pack (Quaternius "Bestiary - Dungeon Monsters Kit", humanoid rig)

Drop the `.glb` files next to `manifest.json` (or in subfolders; paths are relative to the manifest), then edit the
manifest. The committed manifest uses placeholder file names (Ogre, Goblin, ...): change them to the real ones.
The pack becomes `available` when the manifest loads and at least one slot's file exists; slots whose file is missing
fall back to classic individually. Models are preloaded in the background; if one is not ready yet when a game starts,
the classic stand-in is shown and swapped for the model once it is loaded and the creature is idle.

```jsonc
{
  "version": 1,
  "name": "Monsters",                       // shown by T3.creaturePacks()
  "animations": "UniversalAnimationLibrary.glb",   // optional: clips from the Universal Animation Library (same rig)
  "defaults": { ... },                      // any slot option below, applied to every slot
  "slots": {
    "sloth": {                              // sloth|penguin|fox|owl|wizard|pip
      "file": "Ogre.glb",                   // required
      "style": "sloth",                     // personality preset (speed, blink, gaze rate): a classic kind name
      "height": 6.2,                        // model is scaled to this height (creature units; cube = 0.77)
      "hipsAt": 0.5,                        // fraction of height where the hips are; the hips sit on the creature's origin
      "yawDeg": 0,                          // rotate the model if it does not face +z
      "offset": [0, 0, 0],                  // nudge after fitting
      "top": 3.4,                           // height above the hips the camera must keep in view (default derived)
      "hide": ["Weapon", "Shield", "/axe/i"], // node names to hide: substring, or "/regex/flags"
      "bones": {                            // optional overrides (name substring or /regex/); otherwise auto-detected
        "head": "Head", "upperArmL": "UpperArm.L", "upperArmR": "UpperArm.R"
      },
      "hideArms": true,                     // collapse the rig's own arms (upper-arm bones scaled ~0); procedural arms replace them
      "shoulders": [[-1, 1.4, 0], [1, 1.4, 0]],  // procedural arm anchors (default: the upper-arm bones' positions)
      "arm":   { "color": "#7aa35a", "hand": "#7aa35a", "fore": "#7aa35a", "sleeve": true, "L1": 1.3, "L2": 1.4, "handScale": 1.1 },
      "jersey": { "mode": "shell", "y": -0.2, "h": 2.2, "r": 1.1, "z": 1, "x": 0, "zOff": 0 }, // number jersey wrapped around the torso; "mode":"none" to skip
      "team": { "jersey": "#2f9e44", "trim": "#d8f5a2", "num": "1" },  // optional overrides of the classic team colors
      "clips": {                            // clip names (exact, else case-insensitive substring); arrays = candidates in order
        "idle": ["Idle_Loop"], "think": ["Idle_Talking"], "happy": ["Victory"], "sad": ["Defeat"], "challenge": ["Taunt"]
      }
    }
  }
}
```

How it behaves: idle clip loops; each mood (`think happy sad challenge`, plus any clip you map for `dance cry tantrum
gloat`) plays its clip once, then crossfades back to idle. Mood names without a clip still move the head, lean and
procedural arms. The head bone receives the gaze (world-space rotation on top of the clip). Reach/carry always uses the
procedural stretchy arm and gripping hand (rig arms cannot reach across the table), anchored at the shoulders.

Not supported for glTF: facial expressions, tears/steam (classic only), eye tracking. `jersey.mode: "shell"` is a
rigid lathe shell, so it will not deform with the animation; keep it a little smaller than the torso.
