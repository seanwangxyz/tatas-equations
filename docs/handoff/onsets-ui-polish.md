# Handoff: On-Sets 2D side and match flow, one hand with Equations

Owner brief: "improve the on-sets look and feel to make it better match the polish on the equations". This part is the
2D side of On-Sets (menu, tutorial, drills, match panel, builders, pop-ups) and the hooks that make an On-Sets match
feel like an Equations match. The 3D table, cards and cubes (`js/three/onsets3d.js`, `js/onsets/view3d.js`) belong to the
other helper and were not edited. Equations, `engine.js`, `ai.js`, `style.css`, `index.html` and the sound files were not touched.
Rules and scoring are exactly as they were (`node tests/onsets.test.js`: 152, `node tests/engine.test.js`: 948).

Files changed: `js/onsets/game.js`, `ui.js`, `menu.js`, `teach.js`, `css/onsets.css`, this note. No new files, so
`index.html` needs nothing. Run `node tools/build-precache.js` before publishing (the offline list hashes `css/onsets.css` and the four scripts).

## Audit (1280x800, 1024x768, 390x844, Large and XL text) and what changed, screen by screen

| Screen | Before | After |
|---|---|---|
| On-Sets menu | a flat grid of six same-sized buttons, no hierarchy | **Learn / Practise / Play** groups built from the title-menu tiles (icon chips, gloss, subtitle). Big green **Play against {next creature}** + **Pick who**; How to Play, The Rules, Set Drills, 2 Players, 3 Players as tiles. New players see Learn first and an outlined **START HERE** on How to Play; after the tutorial the Play group moves to the top (CSS `order`). Pip's line and the star bar kept |
| Tile on the Equations title menu | a 240 px blue button, left-aligned, out of line with its neighbours | full width, same height/radius/gloss as the other tiles, four-dot card mark, play chip |
| Pick a creature | plain white cards with unstyled dots | the Equations Play-screen trading cards: league colour band (`.opps.lg-1/2/3`), portrait, name + jersey number, title, four strength dots, icon lines ("Sees short sets only", "You beat Snoozy at On-Sets!"), lock badge, **Shakes per match** bar. Locked card gives a kind "win a match against X to unlock Y" |
| Tutorial | centred text on a white panel, a dark-green strip for the cube | step dots + "Step 2 of 9", Pip's line in a bubble, the Set Name on a navy plate, the Universe on a labelled navy felt, kind feedback bubble, big Check/Next |
| Drills | four pastel buttons with emoji | four Equations-style cards with a colour band and icon disc, five **level pips** instead of text, Universe on the felt, icon header (no emoji left) |
| Flat mat (3D off) | the same mat, Goal in a big box | Goal as the same gold **Goal chip** as the 3D screen (label, cubes, "= 8 cards"), only while there is a Goal; crisper cards (inner highlight, dot gloss) and cubes; zone targets as before |
| Builders (Set Name and Goal) | green strip, one text line, emoji pool titles | one set of parts: **Set Name plate** (navy, cubes, `( ) ⌫ Clear`), a **live count chip** with the number ("4 cards in B ∪ G", gold/green/amber tint, "= the Goal!" or "the Goal is 5"), Required / Permitted / Resources / Forbidden **trays** with coloured dots, `Check my Solution!` + a quieter `I can't find one`. Docked version (3D) fits the side column; on phones Required and Permitted sit side by side and the tip hides |
| End of shake | a plain pop-up: lines of text, solutions stacked, score lines | the Equations **`.rc` result card**: ribbon (calm blue "Nice try!" on a miss), Shake n of m + Goal chip, one tile per player (creature portrait or the kid's shirt in his kit colours, points counting up once, "+n this shake"), what happened, every Solution as cubes with the lit cards and a **card count against the Goal** ("6 cards = the Goal ✓" or "9 cards · the Goal is 5"), "One way that works" for a miss, stars earned as chips, one sticky button |
| End of match | two score lines + text | the `.rc-match` card: ribbon, two tiles with VS (winner gold edge and cup) or three tiles for three players, the creature's line in a bubble, "next creature is ready", star chips, Play again / On-Sets menu |
| Pop-ups | emoji headings, text-only | V / Λ choice as two cards with the cubes drawn plus a V / Λ legend; deal as a number grid (6 to 12, last choice highlighted); Third Party as three points tiles; pass-the-device with the player's shirt; Last cube; No Goal / Agreed; Leave the game (green **Keep playing** is the big one); The Rules as rows with cube and card pictures |
| Match panel | (3D already used Equations' `#game` layout) | 3D and flat share `osActionsHTML`: primary Now! / Impossible!, quiet Hint / No Goal possible. In three-player games the "can challenge too" row now says "Spot something? You can call too:" for the kid |

Nothing loops: every new transition is a one-shot 150 to 340 ms (`--ease`, `--t`), and the existing reduced-motion rule still cuts them.
Text size L / XL works through the existing page zoom (checked at 390 px with XL: nothing sticks out; the screen scrolls like Equations'). The
colour-helper selectors in `css/a11y.css` (`.os-card`, `.os-dot`, `.os-tilecards`) match the markup used here.

## Match feel (all hooks guarded; no-ops when a module is missing)

- **Creature moods**: `think` while it chooses a Goal or a move and while it writes; `proud` after it sets a Goal or finds a correct Solution;
  `sheepish` after a wrong or missing Solution; `impressed` (each creature, a beat apart) when the kid sets a big Goal (10+ cards or three digit
  cubes); `nervous` when challenged (already there); `challenge`, `gloat`, `sad` as before; win and lose at the end via the 3D finale.
- **Kid moods** (3D table, through `OS3D.kid`): `proud` after his Goal, `yes` on a right Now! / Impossible! against a creature, `gg` after the
  match (4.6 s later, like Equations), `cheer` / `clap` after a shake as before.
- **Crowd**: `clap` per move, `cheer` / `ooh` on a Goal (`ooh` for a three-digit Goal), `gasp` on a challenge, `cheer` / `aw` after a shake,
  the win cheer. On the flat mat `crowdReact` is called directly (Equations' `crowdSay` does the same), so the sound is there with 3D off.
- **Music**: `think` while a builder is open (now also the Goal builder), `challenge` on a call, `win` on a match win, `play` in between; the
  waltz flavour is selected by `music.js` itself (it looks at `OG`).
- **Sounds**: `Snd.card('place')` when the flat mat deals, `Snd.card('lift')` when a cube lifts its cards and when a tutorial card is picked,
  `Snd.card('flip')` when a Goal cube is turned upside down; the beaten creature's `Snd.motif(kind, 'beaten')` after a win.
- **Not done, and why**
  - *Walk-out and coin toss* (`Matchday.matchStart`): not wired. `js/matchday.js` reads the Equations global `G` all over (its `next()` returns without
    calling `go` when `G !== g`; `makeToss` reads `Eq.CUBE_FACES`; the walk-out reads `G`/`T3` seats), so using it with `OG` would need a hack or an
    edit to `js/matchday.js`. The goal-setter is still the kid first, then clockwise.
  - *Commentator lines*: `Commentary.say` stays silent because `inMatch()` needs `G` and the lines are about maths. The existing
    `Commentary.say('challenge', ...)` call is left as it is (a no-op). I did not edit `js/commentary.js`.

## Three players: the race (this changes behaviour)

Before: with two creatures there was an untimed **Go on** pause after a creature's move; the idle creature checked the move only once, immediately,
and could hold up the turn. Now it is the Equations race, nothing to tap:

1. After every move (and after the Goal is set) everyone except the mover may challenge. There is no pause and no "Go on" button; `ACT.osGoOn` and
   `OG.wait` are gone.
2. A creature that is not moving looks at the move in the background (`osInterject`), and if it spots a Now! or Impossible! it calls after its reaction
   time: `osReactMs` = `max(1800, 6800 - stars*900 - fire*450) + 0..1200` ms (the same formula as `reactMs` in `js/game.js`; stronger creatures are
   quicker; `Pace` is not used because it only works with the Equations `G`). The time is never shown.
3. The creature whose turn it is takes the longer "thinking" pause with three at the table (2.3 to 3.6 s, as in Equations); if it decides to challenge
   instead of moving it also waits its reaction time, so a person can beat it.
4. A pending call is cancelled when someone moves or calls first (`osStill`: the move counter, the phase and the challenge are compared) and it is
   dropped if a cube is being carried at that moment. The mover can never challenge their own move (`osCanChallenge`, `osInterject`, the solver turn).
5. A person (the kid, or Tata at the table) can call at any time after a move: the row **"Spot something? You can call too:"** has Now! and Impossible!.
6. Order is **clockwise: kid, the creature on his left, the one on his right**. On the wide 3D table creature seat 1 stands on the left and on the tall
   one seat 0 does, so on the wide table `osClockwise()` (game.js, called right after `OS3D.begin()`) sets `OG.seatFlip`, `osSeat()` flips, and
   `T3.setCreatures` is called again with the two kinds in reverse order (view3d.js seats creatures in player order). The wide/tall test is the same as
   `chooseLayout` / `startMatch` in Equations (`#gMat` aspect < 0.9 is tall). Nothing in view3d.js had to change; every 3D call there goes through
   `osSeat()`. Third Party scoring, "No Goal", the last-cube rule and rule VI-C are untouched.

Optional cleaner version for the lead (only if you prefer one place for the seats): in `js/onsets/view3d.js`, function `seatPeople`, build the list
`ais.map(...)` and call `.reverse()` on it when `OG.seatFlip`, then delete the `T3.setCreatures(...)` line in `osClockwise()` (keep `OG.seatFlip`).

Also for the lead (view3d.js, not mine): the Universe count chip still uses an emoji (`🃏 8` in `render()`); `ico('cube')` would match the line icons.

## Verified

- `node tests/onsets.test.js` 152 passed, `node tests/engine.test.js` 948 passed; `node --check` on every touched file.
- Scripted play in headless Chrome (own server on its own port; page timers, the solver on the page): full matches vs one creature (flat), pass-and-play,
  kid + Tata + creature, three people, kid + two creatures (strong and weak pairs). Counted per player: the sequence is p0, p1, p2, p0... with no
  gap for "Go on". A creature call out of turn ("CHALLENGE now by p2 mover p0 turn p1") came 3.3 s after the move; the kid's call at once after p1's move
  (turn was p2) took the shake; calling on one's own move was ignored. Leaving mid-shake and starting another match (flat and 3D) left no errors.
- 3D (software GL): 1v1 and a full kid + two creatures match to the results card with no errors; wide table shows Rusty (first to play) on the kid's
  left, Mondo on his right; docked builders over the side column.
- Tutorial start to finish and every drill (right and wrong answers, three rounds each), by script. Menu, picker, tutorial, drills, match (flat), builders,
  every pop-up and the result cards were looked at at 1280x800, 1024x768 and 390x844; XL text at 390.
- Not verified: iPad touch, sound and voice by ear, a real mouse drag on the 3D table, the walk-out/toss (not wired), the colour-blind letters on the new
  pictures (the markup reuses the classes that a11y.css already covers), the 3D builder dock at XL, and Large text on every pop-up.
