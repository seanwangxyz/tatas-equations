# To-do list

## In progress
- Visual upgrade (four parallel pieces): table/room/camera, creatures + packs, sound + voices, interface.

## Next
- **Training Camp** (replaces the Daily Puzzle button; daily puzzle becomes one item inside it).
  Drills generated and graded by the solver, getting harder as he improves:
  1. Make the Goal (find a Solution)
  2. Now or not yet? (spot whether Now! works)
  3. Impossible detective (can the Goal still be made?)
  4. Safe move (don't hand the other player a Now!)
  5. Set a sneaky Goal
  6. New-operation drills after each unlock
  Drills earn skill stars toward unlocking operations. No timers, no streak guilt.
  Also fix: re-solving the same daily puzzle shouldn't earn a star each time.
- **Online play** (Houston ↔ Atlanta): room codes, synced dice, private Solution writing,
  reconnect after a dropped connection. Voice via FaceTime alongside at first.
- **Monster pack**: needs the Quaternius "Bestiary - Dungeon Monsters Kit" (Standard zip) and
  "Universal Animation Library" downloaded into `assets-src/`. Classic creatures stay the default.

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
| × and ÷ (whole answers) | 5 | 5 |
| Fractions | 6 more | 11 |
| Powers (^) | 6 more | 17 |
| Roots (√) | 6 more | 23 |

A star = one correct Solution or one correct Impossible! call. Settings → Parent corner can unlock everything.
