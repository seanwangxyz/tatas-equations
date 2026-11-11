# To-do list

## Done
- Visual upgrade: table/room/camera, creatures + packs + reactions, sound + voices, interface.
- Creature attitude: gloating, sore losing, trash talk, bluffing (Settings switches).
- Training Camp: five solver-made drills with levels; drills earn skill stars; daily puzzle lives inside it and only earns a star once a day.

## Next
- **Online play** (Houston ↔ Atlanta): room codes, synced dice, private Solution writing,
  reconnect after a dropped connection. Voice via FaceTime alongside at first.
- **Monster pack**: needs the Quaternius "Bestiary - Dungeon Monsters Kit" (Standard zip) and
  "Universal Animation Library" downloaded into `assets-src/`. Classic creatures stay the default.

- **Creature thinking speed with all operations unlocked**: in the playtest a whole shake used 4-6 seconds of thinking in total on a laptop (a turn can take close to a second; an iPad is slower, and the screen freezes while it thinks). Move the solver into a background worker.
- **Playtest with the real kid**: the simulated "beginner" is only a rough stand-in. Retune Snoozy/Penny after watching him play (tests/playtest.js prints the numbers).

- **Math tastes per creature** (idea from Tata, not started): Snoozy small numbers and +; Penny loves −; Rusty × and ÷; Ollie prime-number Goals; Mondo powers and roots. Tastes show in the Goals they set, what they put in Required, the Solutions they write and their lines; they follow the unlock ladder.

## To mull over
- **Logs and trig (sin/cos)** as a far-future stage of the ladder.
  - The official cubes have no log/sin symbols, so this is a house rule (e.g. bonus cubes).
    First read the Junior and Senior variation sections of the rulebook (PDF section XIII-C/D)
    to see what the tournament game already does at that level.
  - The game checks every value exactly (fractions, no rounding). Most log/trig values aren't
    exact, so only allow clean cases, the way roots work now: log₂ 8 = 3, sin 30° = 1/2, etc.
- Built-in voice chat for online play.
- Unlock ladder pacing (currently 5 / 6 / 6 / 6 skill stars): revisit once he's played a while.

## Unlock ladder (for reference)
| To unlock | Stars needed | Running total |
|---|---|---|
| × and ÷ (whole answers) | available from the start | 0 |
| Fractions | 6 | 6 |
| Powers (^) | 6 more | 12 |
| Roots (√) | 6 more | 18 |

A star = one correct Solution or one correct Impossible! call. Settings → Parent corner has a switch for each operation (and "Back to automatic" for the ladder).
