# Tata's Equations

A kid-friendly video game version of *EQUATIONS: The Game of Creative Mathematics*
(Layman Allen). Rules reference: [RULES_SUMMARY.md](RULES_SUMMARY.md).

## Play it

The game is a plain website: no build step. It needs to be opened from a web address
(the 3D parts won't load from a double-clicked file).

- **Online:** the GitHub Pages address for this project.
- **On this computer:** in a terminal in this folder, run the line below, then open
  http://localhost:3460 in a browser.

```bash
python -m http.server 3460 --bind 127.0.0.1
```

## Check the math

```bash
node tests/engine.test.js
```

135 checks: the evaluator, the Solution validator, the solver, and the official 2- and
3-player challenge scoring.

## Where things live

| File | What it holds |
|---|---|
| `index.html` | The page shell: screens, pop-up containers, and the list of scripts |
| `css/style.css` | All styling for menus, pop-ups, the flat 2D mat |
| `js/engine.js` | Math engine: exact fractions, evaluator, validator, solver, scoring (unit-tested) |
| `js/config.js` | Settings Tata can change (`TATA_RECORD`), difficulty ladder, opponents, saving |
| `js/sound.js` | All sound and music (generated with the Web Audio API) |
| `js/fx.js` | Confetti, bursts, fireworks |
| `js/ui.js` | Pip's drawing, avatars, intro, dedication, title screen |
| `js/progress.js` | XP, levels, badges, unlock celebrations, pop-up helpers |
| `js/game.js` | Game flow (turns, challenges, last cube, scoring screens) and the computer player |
| `js/builder.js` | The tap-to-build Goal/Solution screen |
| `js/screens.js` | Daily puzzle, opponent picker, Trophy Room, Stats, Settings |
| `js/camp.js` | Training Camp: solver-made drills (make the Goal, Now or not, Impossible detective, safe move, sneaky Goal) |
| `js/tutorial.js` | The guided practice shake |
| `js/main.js` | Tap/drag input, 3D table hooks, startup |
| `js/three/table.js` | 3D table, dice, cup pour (physics), 3D taps and drags |
| `js/three/creatures.js` | 3D creature opponents and their animations |
| `legacy/` | The last single-file version, kept as a backup |

The plain scripts in `js/` share global names (`S` = saved progress, `G` = current game,
`Eq` = engine, `Snd` = sound, `T3` = 3D table). The two files in `js/three/` are ES modules
that plug into `window.T3`; if they can't load, the game falls back to the flat 2D mat.
