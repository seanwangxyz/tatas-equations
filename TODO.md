# To-do list

## Done
- Visual upgrade: table/room/camera, creatures + packs + reactions, sound + voices, interface.
- Creature attitude: gloating, sore losing, trash talk, bluffing (Settings switches).
- Training Camp: five solver-made drills with levels; drills earn skill stars; daily puzzle lives inside it and only earns a star once a day.

- Round 3 (Opus agents): bigger opponents, card portraits, kid's 3D player, night/beach/volcano arenas, shadows + glow + close-ups + auto quality, Cup tournaments, How Many Ways?, background thinking, math tastes.

- Round 4: Team-up vs the boss (house rules in docs/handoff/team.md); five Variation cards from rulebook XIII-A (RULES_SUMMARY.md section 5).

## Next
- **Check on a real iPad**: frame rate with shadows/glow, auto quality step-down, portraits speed, the kid player's size.
- **Online play** (Houston ↔ Atlanta): built (docs/handoff/online.md). Still to do: Tata creates the Firebase
  project and pastes the config into `js/online-config.js` (steps in the handoff), then a real two-iPad test.
- **Monster League** (opponents 6-10: Grub, Splosh, Blaze, Hex, Zog) is built from the two free Quaternius models. Not on the live site until Tata says to publish the model files. Still to do: make them bigger at the table; watch every reaction in real time; retune their skill numbers (only one short playtest so far).

- **Playtest with the real kid**: the simulated "beginner" is only a rough stand-in. Retune Snoozy/Penny after watching him play (tests/playtest.js prints the numbers).


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
| Bigger Goals (to 50). Fractions are allowed from the start | 6 | 6 |
| Powers (^) | 6 more | 12 |
| Roots (√) | 6 more | 18 |

A star = one correct Solution or one correct Impossible! call. Settings → Parent corner has a switch for each operation (and "Back to automatic" for the ladder).

## Round 5 (built, not yet published)
- Blocky cheering crowd, look-around camera + photo, kid face + Tata player + kit designer + celebrations,
  Puzzle from Tata (codes), Pip's after-match tip, endless puzzles, Three at the table (ai3) with crowns.
- Still to do: seat both creatures in 3D in Three at the table (only the one who is "up" shows);
  speech bubbles don't follow the creature after the view is swung; the kid looks sunk from side views;
  check Tata's face across the table; listen to the crowd sounds; iPad test of two-finger look-around and photo saving.

## Round 7 (built, waiting for Tata's OK to publish)
- 3D title page with sound; shirt front + away/third kits, armband, boots, sleeves, gloves, number styles;
  goal replay, commentator, fireworks; growing stadium (5 tiers) + weather/time of day; season table,
  3D trophy cabinet, Spot the Fan; 14 more official variation cards (19 in all); three bonus dice (house rule).
- Still to do: listen to all new sounds; real iPad test (weather redraws ~19/s, bigger crowd, d20 dice);
  3D cubes do not turn for Upside-down/Sideways (the Goal banner shows it); online skips the new cards and dice;
  bases 11/12 not built (Junior level).
