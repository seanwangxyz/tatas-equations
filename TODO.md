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

## Round 8 (built, waiting for Tata's OK to publish)
- Twist card deck (replaces the teal die); Google sign-in + cloud save (Firebase: Google provider on, profsean.wang
  authorised, users/$uid rule published); new title menu + What's new tour; 3D variation cubes and labels;
  online: three players, cards and dice, rematch (needs docs/handoff/firebase-rules-v2.json published WITH the code);
  parent page; Legend League (opponents 11-15, signature rules, career); On-Sets first playable (flat mat);
  proper football shorts and Tata's athletic build; shirt back name setting (TYSON W.); Play screen tabs.
- Still to do: test real Google sign-in and a real three-player room after publishing; iPad/sound pass;
  second extra figure for three humans in 3D; On-Sets 3D, three players, variations.

## Round 9, the overnight run of 13 Nov 2026 (built on this computer, NOT published; waiting for Tata)
Restore points (git tags): `before-night-2026-11-13` (start), `live-2026-11-13` (what is on the site),
`night-1-nine-items`, `night-2-creative-round-1`, `night-3-creative-round-2`, `night-4-gameplay`, `night-5-polish`.
Every helper's piece is also its own merge commit, so one piece can be undone with `git revert -m 1 <merge>`.
- Nine items: Explain this Solution; creatures that remember (S.rivals); voice/video in online rooms (OFF until
  docs/handoff/firebase-rules-v3.json is published: needs Tata's OK; rooms/$code/rtc); install as an app + offline
  (run `node tools/build-precache.js` before every publish; the offline cache is off on localhost unless ?sw=1);
  colour helpers, text size, reduce flashing; On-Sets in 3D with three players; tournament practice + Judge Pip
  (several variation cards at once; RULES_SUMMARY.md section 8); one audio bus, Sound check, speed overlay (?perf=1);
  match day: walk-out, toss for the first Goal, trophy lift.
- Creative: cube and table craft; creature acting (nothing moves at rest); one musical theme with league/venue/
  evening flavours and creature motifs; painted skies, floodlights at dusk, designed big screen, photo frames;
  result cards, creature trading cards, Settings switches; the crowd as supporters; avatar poses and new
  celebrations; step-by-step Goal replay, composed fireworks, trophy room, still title.
- Gameplay (house features, each with a Settings switch): match missions + Skills Passport (S.missions);
  the "Why?" button that explains a move already made.
- Layout: the match side column now also on iPad landscape (min-width 1000px, aspect 5:4); compact phone panel.
- Tests: engine 948, explain 4558, rivals 2110, account 595, parent 75, onsets 152, voice 61, missions 603, why 4910.
- Still to do: Tata's 5-minute device and sound checklist (docs/handoff/device-checklist.md); nobody has heard the
  new music or sounds; real iPad/Safari; real Google sign-in; publish Firebase rules v3 before voice works;
  camera hooks kickoff/hero/final from docs/handoff/light.md not applied (the walk-out covers kick-off);
  handshake with the creature and Tata on the podium; On-Sets poster on the title; a second figure for three
  humans online in 3D.
