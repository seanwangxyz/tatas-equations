# Optional recorded sounds

Everything in the game is synthesized by `js/sound.js`, so this folder can stay empty.
To use a real recording for any sound, put the file here and list it in `manifest.json`.
If a name is not listed, or its file is missing or fails to decode, the synthesized version plays.
No code changes are needed.

## manifest.json

```json
{
  "sounds": {
    "thunk": ["thunk1.ogg", "thunk2.ogg"],
    "chime": "chime.mp3",
    "diceHit": { "files": ["die1.ogg", "die2.ogg", "die3.ogg"], "gain": 0.9, "rate": [0.94, 1.06] }
  }
}
```

Each value is one of:

- a file name (string),
- an array of file names (one is picked at random each time, which avoids repetition),
- an object `{ "files": [...], "gain": 1, "rate": [lo, hi] }` (`gain` multiplies the volume,
  `rate` is the random playback-speed range, default `[0.97, 1.03]`; `"file": "x.ogg"` also works).

File names are relative to this folder. Formats: anything the browser decodes (ogg, mp3, wav, m4a).
Files load in the background after the first tap and are used from then on, so the first play of a
sound may still be the synthesized one. Serve over http (not `file://`) so the files can be fetched.

## Sound names

| Name | Played when |
|---|---|
| `diceHit` | one die hits the table or another die (volume follows impact strength, many per second) |
| `clatter` | dice spill and settle (intro, dice-roll screen); default is a cascade of `diceHit` |
| `cupRattle` | the cup is shaken |
| `pickup` | a cube is picked up |
| `thunk` | a cube lands in a zone |
| `click` | UI tap |
| `pop` | small positive UI pop |
| `chime` | correct answer |
| `boop` | gentle "not quite" |
| `slam` | a challenge is called |
| `fanfare` | badge, level up, win |
| `crowd` | stadium cheer for big wins |
| `whistle` | referee whistle |

A recorded `fanfare`, `crowd`, `slam` or `clatter` replaces the whole synthesized sound.
Music is always synthesized (mood beds are not file-mapped yet).
