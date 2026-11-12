# Handoff: Team-up vs the boss (agent `team`)

The kid and a grown-up (Tata, Mama...) play on the **same side**, on one device, against one creature.

## Files

- New: `js/team.js` (all the team logic), `css/team.css`.
- `index.html`: loads `css/team.css` and `js/team.js` (after `js/cup.js`, so after `game.js` and `builder.js`).
- `js/screens.js`: one line in `renderSetup()` adds the "Team-up" card at the start of "Play with people".
- `js/game.js`: small hooks, each guarded by `G.team` so the other modes never reach them:
  - `startMatch`: `else if (mode === 'team') Team.setup(G, oppIdx, cfg);`
  - `renderGame`: the team's score slot (`Team.hudHTML`) and the team bar above the buttons (`Team.barHTML`).
  - `placeCube` and `nextTurn`: `Team.sync()` (the other teammate is up next). `nextTurn`: "Tata, your turn".
  - `challenge`: the banner and Pip's line use the teammate's name (who called / who must write).
  - `writeSolution`: `Team.write(mode, cb)` for the team.
  - `resolveChallenge`: `if (G.team) {...} else if (...)` in front of the existing XP block.
  - `startLastWrite`: "Leo & Tata **were** correct" grammar for the team.
  - `endShake`: the two `G.mode === 'ai'` checks also accept `'team'` (same cheer / "Great shake!" pop-up).
  - `endMatch`: first line hands the team's match to `Team.endMatch()`.
  - Nothing in `newShake`, `setGoal`, the Goal builder opening, or the solver helpers was touched.
- From inside `js/team.js` (no edits elsewhere): `ACT.callNow`, `ACT.callImp`, `ACT.lastImp` are wrapped to ask
  "Who spotted it?" in team matches only, and `openGoalBuilder` is wrapped to put the teammate's name in the
  Goal builder's title. Outside a team match the wrappers call the originals unchanged.

## How it works inside

`G.players[0]` is the team ("Leo & Tata", one shared score), `G.players[1]` is the creature. So the game is a
normal two-player game, and the official two-player scoring (`Eq.scoreChallenge`) is used unchanged.
`G.team = { names, jerseys, cur, lastBy, caller, wrote }`: `cur` = the teammate who takes the team's next turn,
`lastBy` = who made the team's last move, `caller` = who called the team's challenge, `wrote` = who wrote.

## Team rules (house rules) — please show these to Tata

None of these are in the official rulebook (it has no team play). They are my own choices.

1. **One team, one score.** The kid and the grown-up are one player. Every point the team earns is shared.
   The team plays the creature with the normal two-player rules and scoring (6 / 2 after a challenge, 4 / 2
   after the last cube).
2. **Take turns.** The teammates take the team's turns in order: one moves (or sets the Goal), then next time it's
   the other one. The kid always starts a match. A challenge called on the team's turn also uses up that turn,
   so the other teammate starts next time.
3. **Either teammate can challenge.** On the team's turn, either of you may call **Now!** or **Impossible!**,
   even if it isn't your go. The game asks "Who spotted it?" so it knows who called.
   (As in normal two-player play, the team can only challenge on its own turn, right after the creature moved.)
4. **One Solution per team, one writer.** When the team has to write a Solution, one teammate holds the
   pencil (taps the cubes) and the other may help with ideas out loud. Who writes:
   - after the team's **Now!**: whoever called it ("you spotted it, you write it");
   - after the creature's **Impossible!**: whoever made the team's last move ("you made the move, you defend it");
   - after the **last cube**: whoever's go it would be next.
5. **Pass the pencil once.** If the writer taps "I can't find one" before checking anything, the other teammate
   may take over and try. Only one Solution is ever checked, so the team never gets two scored tries.
   *Why this rule:* giving the team two separate Solutions would be unfair to the creature (it only gets one)
   and would break the two-player scoring. Letting the stuck writer hand over keeps it one-Solution, but nobody
   is left stuck and sad.
6. **No talking rule.** There is none: teammates may talk and help each other any time. Sharing ideas is the point.

## XP and unlocks (my choices, please check)

- The kid's **own** correct Solution: the normal XP, skill star and stats (exactly as when he plays alone).
- The teammate's Solution counts for the **team's score** only. It does not go into the kid's stats, stars,
  streak or badges.
- The kid's own correct **Now!** / **Impossible!**: normal XP (25 / 30, and the star for Impossible!) and stats.
- The teammate's correct call: **+10 XP "Teamwork"** for the kid. (Small, because it was the grown-up's skill.)
- The creature's Now! fails after a move **the kid** made: +15 XP "Clever move" (same as solo). Not for the
  grown-up's move.
- **Team win: +40 XP the first time against that creature, +15 after.** Tie or loss: no match XP (same as solo,
  where only wins give match XP). A loss shows a kind "Good game, team!" screen, never a shaming one.
- **A team win does NOT count for the "beaten" unlock ladder** (it doesn't unlock the next creature and doesn't
  earn the "Beat the Fox"-style badges, "Comeback Kid", "Perfect Match" or "Beat Tata's Record").
  *Why:* the ladder says "you can beat this creature". With a grown-up on his side that isn't shown yet.
  The team mode is for playing *up* against a creature he can't beat alone. Easy to change: in
  `Team.endMatch()` add `S.beaten[idx] = true` if Tata prefers.
- Team shakes don't count toward "Good Sport" (10 two-player shakes), because he isn't playing against a person.

## Saved data (new keys; js/config.js was read-only for me)

`S.team = { mate: 'Tata', mjersey: '10', boss: <opponent index> }` (the setup pop-up remembers these) and
`S.teamWins = { <opponent index>: <number of team wins> }`. Both are created when first needed, so no default is
required. If you want them in `defaults()` in `js/config.js`:

```js
team: { mate: 'Tata', mjersey: '10', boss: null }, teamWins: {},
```

## Setup

"Play with people" → **Team-up** card → pop-up: Player 1 (the kid, from Settings), teammate's name, teammate's
jersey number, the boss (any unlocked creature; the strongest unlocked one is picked by default: most stars, then
most fire), short rules, **Kick off!** Shakes per match: the usual switch on the setup screen.

## On screen

- Top bar: the team's slot shows both jerseys (the one whose go it is glows, the other is dimmed), a small
  "TEAM" label, "Leo & Tata", and the one shared score. On the team's turn the gold tag says "TATA'S GO".
- Above the buttons: "[10] Tata's turn for the team. Leo can help! Either of you can call a challenge."
  (or "Leo sets the Goal for the team", or "Next for the team: Leo" during the creature's turn).
- Pop-ups: "Who spotted it?" (two big name buttons), "Tata writes it" (who holds the pencil), "Pass the pencil?".
- End of match: "TEAM WIN!" with both jerseys popping in once, "Leo and Tata beat Grub together!", the
  creature's line, scores, XP. The 3D kid player cheers / claps / goes "aw" exactly as in solo play.
- No looping animation: jerseys change size/opacity with a short transition; the end jerseys pop once.

## Known rough edges

- **Who-sets-the-Goal counter:** `setGoal` counts `S.stats.goalsSet` (Goal Getter badge) for the team even when
  the grown-up set it. I left it because `setGoal` is the `variations` agent's area. Fix there:
  `&& !(G.team && G.team.lastBy === 1)` or similar.
- **"No Goal" challenge by the team** (the creature says "No Goal" and the team challenges): it works, but the
  game doesn't ask which teammate writes, and the Equation counts in the kid's stats.
- On a phone-width screen the team name in the top bar shortens to "L..."; the jerseys and the "TATA'S GO"
  tag still show whose go it is.
- The scoring lines say "Leo & Tata called Now!" plus a second line "Tata made the Now! call".

## Bugs found that are NOT from this branch (in read-only files)

- `js/three/stadium.js` line ~232: `var key = null` (the floodlight) overwrites the `key` array that
  `setWave()` uses, so on the non-night stadium every `T3.fx('wave')` throws `Cannot read properties of null
  (reading '0')` on **every frame from then on** (the wave never finishes). `endMatch()` calls `fx3('wave')` on
  every solo win too. Reproduced in a plain `'ai'` match: `fx3('wave')` → errors every frame.
- `js/three/creatures/gestures.js` line 50 (`cry`): `C.rest` is null for the Monster League creatures when the 3D
  table is off, so `creatureMood('cry')` throws a few times. Reproduced in a plain `'ai'` match vs Grub, 3D off.
